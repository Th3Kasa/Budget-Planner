// Theme management. The class-based dark mode is applied by toggling a `dark`
// class on <html>; the actual colours live in the `.dark` override layer in
// index.css. An inline script in index.html applies the saved theme before
// first paint to avoid a flash; this module keeps it in sync afterwards.

export type Theme = "light" | "dark" | "system";

const KEY = "theme";

export function getTheme(): Theme {
  const t = localStorage.getItem(KEY);
  return t === "dark" || t === "light" || t === "system" ? t : "system";
}

export function resolveDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme): void {
  const dark = resolveDark(theme);
  document.documentElement.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0f1729" : "#4f46e5");
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

// Apply the saved theme and keep "system" mode reacting to OS changes.
export function initTheme(): void {
  applyTheme(getTheme());
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (getTheme() === "system") applyTheme("system");
    });
}
