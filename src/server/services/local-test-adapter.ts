import "server-only";
import { AppError } from "./errors";

export function requireLocalTestAdapter() {
  if (process.env.ENABLE_LOCAL_INVENTORY_TEST_ADAPTER !== "true") {
    throw new AppError(
      "LOCAL_INVENTORY_DISABLED",
      "Local inventory is available only for isolated development and tests.",
      404,
    );
  }
}
