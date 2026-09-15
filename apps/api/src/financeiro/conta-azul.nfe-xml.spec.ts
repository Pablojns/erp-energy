import { parseNfeXml } from './conta-azul.nfe-xml';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35240112345678000199550010000019591234567890">
      <ide>
        <nNF>1959</nNF>
        <dhEmi>2026-03-10T14:22:00-03:00</dhEmi>
        <dhSaiEnt>2026-03-10T18:40:00-03:00</dhSaiEnt>
      </ide>
      <emit><CNPJ>41356091000180</CNPJ><xNome>SUNHUB</xNome></emit>
      <dest>
        <CNPJ>29.720.805/0001-91</CNPJ>
        <xNome>PRATYC COMERCIO</xNome>
        <enderDest>
          <xLgr>Rua das Flores</xLgr>
          <nro>100</nro>
          <xBairro>Centro</xBairro>
          <xMun>Campinas</xMun>
          <UF>SP</UF>
          <CEP>13000000</CEP>
        </enderDest>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>SKU-10</cProd>
          <xProd>Modulo 550W</xProd>
          <NCM>85414000</NCM>
          <uCom>UN</uCom>
          <qCom>2.0000</qCom>
          <vUnCom>100.00</vUnCom>
          <vProd>200.00</vProd>
          <xPed>4518727765</xPed>
          <nItemPed>10</nItemPed>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>SKU-20</cProd>
          <xProd>Inversor 8kW</xProd>
          <uCom>UN</uCom>
          <qCom>1.0000</qCom>
          <vUnCom>1500.50</vUnCom>
          <vProd>1500.50</vProd>
        </prod>
      </det>
      <total><ICMSTot><vNF>1700.50</vNF></ICMSTot></total>
      <transp>
        <vol>
          <qVol>3</qVol>
        </vol>
      </transp>
    </infNFe>
  </NFe>
</nfeProc>`;

describe('parseNfeXml', () => {
  it('extrai cabeçalho, destinatário e itens da NF-e', () => {
    const parsed = parseNfeXml(SAMPLE);
    expect(parsed).toMatchObject({
      invoiceNumber: '1959',
      chave: '35240112345678000199550010000019591234567890',
      destDocumento: '29720805000191',
      destNome: 'PRATYC COMERCIO',
      destUf: 'SP',
      total: 1700.5,
      volumes: 3,
      saiuEm: '2026-03-10T18:40:00-03:00',
    });
    expect(parsed?.items).toEqual([
      expect.objectContaining({
        nItem: 1,
        sku: 'SKU-10',
        description: 'Modulo 550W',
        quantity: 2,
        unitPrice: 100,
        totalPrice: 200,
        ncm: '85414000',
        unit: 'UN',
        xPed: '4518727765',
        nItemPed: 10,
      }),
      expect.objectContaining({
        nItem: 2,
        sku: 'SKU-20',
        quantity: 1,
        unitPrice: 1500.5,
      }),
    ]);
    expect(parsed?.destEnderecoJson).toContain('Rua das Flores');
  });

  it('aceita prefixo de namespace nos tags', () => {
    const xml = SAMPLE.replace(/<nfeProc /g, '<nfe:nfeProc ').replace(
      /<\/nfeProc>/g,
      '</nfe:nfeProc>',
    );
    expect(parseNfeXml(xml)?.invoiceNumber).toBe('1959');
  });

  it('devolve null para XML vazio ou sem NF-e', () => {
    expect(parseNfeXml('')).toBeNull();
    expect(parseNfeXml('<xml>nao e nfe</xml>')).toBeNull();
  });
});
