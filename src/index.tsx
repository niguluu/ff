#!/usr/bin/env node
import { render } from "ink";
import App from "./app.js";

if (!process.stdin.isTTY) {
  console.error("Error: must run in an interactive terminal.");
  process.exit(1);
}

render(<App />);
