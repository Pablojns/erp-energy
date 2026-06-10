const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const filePath = 'C:\\Users\\SUNHUB\\Desktop\\RoboMercado\\Base_Logistica_Suprema.xlsx';
  const url = 'http://localhost:3000/api/erp/pedidos/importar';

  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);

  const form = new FormData();
  form.append(
    'file',
    new Blob(
      [fileBuffer],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ),
    fileName,
  );

  const res = await fetch(url, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  console.log('status:', res.status);
  console.log('ok:', res.ok);
  console.log('response:', text);
}

main().catch((error) => {
  console.error('upload_failed:', error);
  process.exitCode = 1;
});
