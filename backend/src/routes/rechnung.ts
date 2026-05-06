import { Router } from "express";

export const rechnungRouter = Router();

// Routes will be implemented when section functionality is added
rechnungRouter.get("/", (_req, res) => {
  res.json({ message: "Rechnung API — coming soon" });
});
