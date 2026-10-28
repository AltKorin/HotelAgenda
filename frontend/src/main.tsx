import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Guest from "./guest/Guest.tsx";
import Panel from "./panel/Panel.tsx";
import Staff from "./staff/Staff.tsx";
import Gallery from "./screen/Gallery.tsx";
import Screen from "./screen/Screen.tsx";
import Site from "./site/Site.tsx";

// Everything else (/, /rejestracja, /regulamin, unknown paths) is the public site.
// ponytail: path switch instead of a router — add one when the panel brings real navigation.
const path = window.location.pathname;
const screen = path.match(/^\/ekran\/([^/]+)\/?$/);
const guest = path.match(/^\/g\/([^/]+)\/?$/);
const staff = path.match(/^\/o\/([^/]+)\/?$/);
const query = new URLSearchParams(window.location.search);
const theme = query.get("motyw") ?? undefined;
const fonts = query.get("czcionki") ?? undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {path.startsWith("/panel") ? (
      <Panel />
    ) : guest ? (
      <Guest token={decodeURIComponent(guest[1])} />
    ) : staff ? (
      <Staff token={decodeURIComponent(staff[1])} />
    ) : /^\/ekran\/motywy\/?$/.test(path) ? (
      <Gallery />
    ) : screen ? (
      <Screen token={decodeURIComponent(screen[1])} theme={theme} fonts={fonts} />
    ) : (
      <Site path={path} />
    )}
  </StrictMode>,
);
