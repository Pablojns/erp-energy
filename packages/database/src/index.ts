export { prisma } from "./client";

/** Re-exporta o namespace e tipos do runtime gerado para consumo por `@erp/api` sem importar `@prisma/client` diretamente. */
export {
  Prisma,
  StockMovementType,
  OrderSource,
  OrderStatus,
  OrderImportStatus,
  OrderItemStockStatus,
  InvoiceStatus,
} from "@prisma/client";

export type { Product, ProductCategory } from "@prisma/client";
