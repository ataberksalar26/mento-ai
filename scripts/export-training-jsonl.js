const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'data', 'mento-brain-questions.json');
const outputPath = path.join(root, 'data', 'training.jsonl');

const dataset = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const items = Array.isArray(dataset.items) ? dataset.items : [];

const rows = [];

for (const item of items) {
  rows.push({
    prompt: `${item.exam} ${item.lesson} ${item.topic} konusunu anlat.`,
    completion: `${item.topic}: ${item.coach} Örnek soru tipi: ${item.type}. Sık hata: ${item.mistake}`
  });

  rows.push({
    prompt: `${item.question}\nBu soruyu adım adım çöz.`,
    completion: `${item.solution}\nCevap: ${item.answer}\nSık hata: ${item.mistake}`
  });

  rows.push({
    prompt: `${item.exam} öğrencisi ${item.lesson} ${item.topic} konusunda yanlış yapıyor. Nasıl çalışmalı?`,
    completion: item.coach
  });
}

fs.writeFileSync(outputPath, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
console.log(`${rows.length} eğitim satırı yazıldı: ${outputPath}`);
