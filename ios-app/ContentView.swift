import SwiftUI

struct ContentView: View {
    @State private var canGoBack = false
    @State private var isLoading = true
    @State private var reloadToken = UUID()
    @State private var backToken = UUID()

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.03, green: 0.07, blue: 0.12), Color(red: 0.06, green: 0.12, blue: 0.20)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                header

                MentoWebView(
                    url: AppConfig.homeURL,
                    reloadToken: reloadToken,
                    backToken: backToken,
                    canGoBack: $canGoBack,
                    isLoading: $isLoading
                )
                .ignoresSafeArea(edges: .bottom)
            }

            if isLoading {
                loadingView
            }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            logo

            VStack(alignment: .leading, spacing: 2) {
                Text(AppConfig.appName)
                    .font(.headline.weight(.heavy))
                    .foregroundStyle(.white)
                Text("Yapay zekalı sınav koçu")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.58))
            }

            Spacer()

            Button {
                if canGoBack {
                    backToken = UUID()
                }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 38, height: 38)
            }
            .disabled(!canGoBack)
            .foregroundStyle(canGoBack ? .white : .white.opacity(0.28))
            .background(.white.opacity(canGoBack ? 0.10 : 0.05), in: RoundedRectangle(cornerRadius: 13))

            Button {
                reloadToken = UUID()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 38, height: 38)
            }
            .foregroundStyle(.white)
            .background(.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 13))
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(.ultraThinMaterial.opacity(0.35))
    }

    private var logo: some View {
        ZStack(alignment: .topTrailing) {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(red: 0.96, green: 0.70, blue: 0.24).opacity(0.16))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(red: 0.96, green: 0.70, blue: 0.24).opacity(0.45), lineWidth: 1)
                )
                .frame(width: 40, height: 40)

            Text("M")
                .font(.system(size: 23, weight: .black, design: .rounded))
                .foregroundStyle(Color(red: 1.0, green: 0.82, blue: 0.42))
                .frame(width: 40, height: 40)

            Image(systemName: "sparkle")
                .font(.system(size: 8, weight: .black))
                .foregroundStyle(Color(red: 1.0, green: 0.82, blue: 0.42))
                .offset(x: 4, y: -5)
        }
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            logo
                .scaleEffect(1.15)

            ProgressView()
                .tint(Color(red: 0.96, green: 0.70, blue: 0.24))

            Text("Mento AI açılıyor")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white.opacity(0.82))
        }
        .padding(24)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
    }
}
