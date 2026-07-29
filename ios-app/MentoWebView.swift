import SwiftUI
import WebKit
import UIKit
import PhotosUI
import UniformTypeIdentifiers

struct MentoWebView: UIViewRepresentable {
    let url: URL
    let reloadToken: UUID
    let backToken: UUID
    @Binding var canGoBack: Bool
    @Binding var isLoading: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.customUserAgent = "MentoAI iOS/1.0"
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if context.coordinator.reloadToken != reloadToken {
            context.coordinator.reloadToken = reloadToken
            webView.reload()
        }

        if context.coordinator.backToken != backToken {
            context.coordinator.backToken = backToken
            if webView.canGoBack {
                webView.goBack()
            }
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, UIImagePickerControllerDelegate, UINavigationControllerDelegate, PHPickerViewControllerDelegate, UIDocumentPickerDelegate {
        private let parent: MentoWebView
        var reloadToken: UUID
        var backToken: UUID
        private var openPanelCompletion: (([URL]?) -> Void)?

        init(_ parent: MentoWebView) {
            self.parent = parent
            self.reloadToken = parent.reloadToken
            self.backToken = parent.backToken
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            parent.isLoading = true
            parent.canGoBack = webView.canGoBack
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.isLoading = false
            parent.canGoBack = webView.canGoBack
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            parent.isLoading = false
            parent.canGoBack = webView.canGoBack
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            parent.isLoading = false
            parent.canGoBack = webView.canGoBack
            showOfflinePage(in: webView)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let host = navigationAction.request.url?.host else {
                decisionHandler(.allow)
                return
            }

            if host == AppConfig.allowedHost || host.hasSuffix("." + AppConfig.allowedHost) {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
                UIApplication.shared.open(navigationAction.request.url!)
            }
        }

        func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
            guard let presenter = webView.closestViewController else {
                completionHandler(nil)
                return
            }

            openPanelCompletion = completionHandler
            let sheet = UIAlertController(title: "Soruyu ekle", message: "Çözüm için görsel veya dosya seç.", preferredStyle: .actionSheet)

            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                sheet.addAction(UIAlertAction(title: "Fotoğraf çek", style: .default) { [weak self] _ in
                    self?.presentCamera(from: presenter)
                })
            }

            sheet.addAction(UIAlertAction(title: "Galeriden seç", style: .default) { [weak self] _ in
                self?.presentPhotoPicker(from: presenter)
            })
            sheet.addAction(UIAlertAction(title: "Dosya seç", style: .default) { [weak self] _ in
                self?.presentDocumentPicker(from: presenter)
            })
            sheet.addAction(UIAlertAction(title: "Vazgeç", style: .cancel) { [weak self] _ in
                self?.finishFileSelection(nil)
            })

            if let popover = sheet.popoverPresentationController {
                popover.sourceView = webView
                popover.sourceRect = webView.bounds
            }
            presenter.present(sheet, animated: true)
        }

        private func presentCamera(from presenter: UIViewController) {
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            picker.cameraCaptureMode = .photo
            picker.delegate = self
            presenter.present(picker, animated: true)
        }

        private func presentPhotoPicker(from presenter: UIViewController) {
            var configuration = PHPickerConfiguration(photoLibrary: .shared())
            configuration.filter = .images
            configuration.selectionLimit = 1
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            presenter.present(picker, animated: true)
        }

        private func presentDocumentPicker(from presenter: UIViewController) {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.image, .pdf], asCopy: true)
            picker.delegate = self
            presenter.present(picker, animated: true)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            picker.dismiss(animated: true)
            finishFileSelection(nil)
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            picker.dismiss(animated: true)
            guard let image = info[.originalImage] as? UIImage,
                  let data = image.jpegData(compressionQuality: 0.9) else {
                finishFileSelection(nil)
                return
            }
            finishFileSelection(saveTemporary(data: data, extension: "jpg"))
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)
            guard let provider = results.first?.itemProvider else {
                finishFileSelection(nil)
                return
            }
            provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] data, _ in
                DispatchQueue.main.async {
                    self?.finishFileSelection(data.flatMap { self?.saveTemporary(data: $0, extension: "jpg") })
                }
            }
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
            finishFileSelection(nil)
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let selectedURL = urls.first else {
                finishFileSelection(nil)
                return
            }
            let didAccess = selectedURL.startAccessingSecurityScopedResource()
            defer {
                if didAccess {
                    selectedURL.stopAccessingSecurityScopedResource()
                }
            }
            finishFileSelection(copyTemporaryFile(from: selectedURL))
        }

        private func saveTemporary(data: Data, extension fileExtension: String) -> URL? {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("mento-soru-\(UUID().uuidString).\(fileExtension)")
            do {
                try data.write(to: url, options: .atomic)
                return url
            } catch {
                return nil
            }
        }

        private func copyTemporaryFile(from sourceURL: URL) -> URL? {
            let fileExtension = sourceURL.pathExtension.isEmpty ? "dat" : sourceURL.pathExtension
            let targetURL = FileManager.default.temporaryDirectory.appendingPathComponent("mento-dosya-\(UUID().uuidString).\(fileExtension)")
            do {
                try FileManager.default.copyItem(at: sourceURL, to: targetURL)
                return targetURL
            } catch {
                return nil
            }
        }

        private func finishFileSelection(_ url: URL?) {
            let completion = openPanelCompletion
            openPanelCompletion = nil
            completion?(url.map { [$0] })
        }

        private func showOfflinePage(in webView: WKWebView) {
            let html = """
            <!doctype html>
            <html lang="tr">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <body style="margin:0;background:#07111e;color:#e9f0f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:28px">
              <main>
                <div style="width:58px;height:58px;border-radius:18px;margin:0 auto 18px;display:grid;place-items:center;background:#f4b63e22;border:1px solid #f4b63e66;color:#ffd36b;font-size:34px;font-weight:900">M</div>
                <h1 style="font-size:26px;margin:0 0 10px">Bağlantı yok</h1>
                <p style="color:#9fb0c8;line-height:1.5;margin:0 0 22px">Mento AI'a ulaşamadık. İnternet bağlantını kontrol edip tekrar dene.</p>
                <button onclick="location.reload()" style="border:0;border-radius:14px;background:#f4b63e;color:#07111e;font-weight:900;padding:14px 22px">Tekrar dene</button>
              </main>
            </body>
            </html>
            """
            webView.loadHTMLString(html, baseURL: AppConfig.fallbackURL)
        }
    }
}

private extension UIView {
    var closestViewController: UIViewController? {
        sequence(first: self.next, next: { $0?.next })
            .first { $0 is UIViewController } as? UIViewController
    }
}
