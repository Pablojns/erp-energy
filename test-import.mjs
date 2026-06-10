import FormData from 'form-data';
import fetch from 'node-fetch';
import fs from 'fs';

const form = new FormData();
form.append('file', fs.createReadStream('C:\\Users\\SUNHUB\\Desktop\\RoboMercado\\Base_Logistica_Suprema.xlsx'), {
  filename: 'Base_Logistica_Suprema.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});

const res = await fetch('http://localhost:3001/api/pedidos/importar', {
  method: 'POST',
  body: form,
  headers: form.getHeaders()
});

const json = await res.json();
console.log('Status:', res.status);
console.log('Resultado:', JSON.stringify(json, null, 2));
