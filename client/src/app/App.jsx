import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AppProviders } from "./AppProviders";
import { AppRoutes } from "./AppRoutes";

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}
