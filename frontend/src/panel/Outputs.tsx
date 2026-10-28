// „Ekran i obsługa”: hotel-wide links. Their tokens are shown once (only a digest is stored).
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { api, upload, useApi, type Hotel, type Link } from "./api.ts";
import Slides from "./Slides.tsx";
import { LogoField, useToast } from "./ui.tsx";

const KINDS = {
  screen: {
    title: "Ekran w holu",
    path: "ekran",
    help: "Otwórz ten adres w przeglądarce na komputerze podłączonym do telewizora i naciśnij F11 (pełny ekran). Ekran sam pokazuje wszystkie grupy obecne w hotelu i odświeża się co minutę.",
  },
  staff: {
    title: "Agenda dla obsługi",
    path: "o",
    help: "Wspólny link dla pracowników: cała agenda z kartami zlecenia. Otwórz go na telefonie lub tablecie przy recepcji. Kto go ma, widzi menu, ustawienia i odpowiedzialnych — nie wysyłaj go gościom.",
  },
} as const;

type Kind = keyof typeof KINDS;

export default function Outputs({ hotel, onHotelChange }: { hotel: Hotel; onHotelChange: () => void }) {
  const links = useApi<Link[]>(`/hotels/${hotel.id}/links/`);
  const [fresh, setFresh] = useState<Partial<Record<Kind, string>>>({});
  const toast = useToast();

  const create = async (kind: Kind) => {
    const old = links.data?.filter((l) => l.kind === kind) ?? [];
    const link = await api.post<{ token: string }>(`/hotels/${hotel.id}/links/`, { kind });
    for (const o of old) await api.post(`/hotels/${hotel.id}/links/${o.id}/revoke/`);
    setFresh((f) => ({ ...f, [kind]: `${window.location.origin}/${KINDS[kind].path}/${link.token}` }));
    links.reload();
    toast(old.length ? "Nowy link gotowy. Poprzedni przestał działać." : "Link gotowy.");
  };

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Ekran i obsługa</h1>
          <p>Logo i slajdy hotelu na ekranie w holu oraz linki dla telewizora i dla pracowników. Agendy grup pokazują się na ekranie same po opublikowaniu.</p>
        </div>
      </div>
      {!hotel.outputs_enabled && (
        <p className="notice">Ekran i linki są jeszcze wyłączone dla tego hotelu. Włączymy je przy wdrożeniu — linki możesz przygotować już teraz.</p>
      )}
      <section className="link-card" style={{ display: "block", marginBottom: 16 }}>
        <LogoField
          label="Logo hotelu"
          hint="PNG, JPG albo WebP do 2 MB, najlepiej z przezroczystym tłem. Pojawia się od razu na ekranie w holu, w telefonach gości i w PDF-ach."
          value={hotel.logo}
          onUpload={async (file) => {
            try {
              await upload(`/hotels/${hotel.id}/logo/`, file);
              onHotelChange();
              toast("Logo hotelu zapisane. Ekran pokaże je przy najbliższym odświeżeniu.");
              return null;
            } catch (e) {
              return (e as Error).message;
            }
          }}
          onRemove={async () => {
            try {
              await api.delete(`/hotels/${hotel.id}/logo/`, {});
              onHotelChange();
              return null;
            } catch (e) {
              return (e as Error).message;
            }
          }}
        />
      </section>
      <Slides hotel={hotel} />
      {links.error && <p className="error">{links.error}</p>}
      {links.data && (Object.keys(KINDS) as Kind[]).map((kind) => {
        const active = links.data?.filter((l) => l.kind === kind) ?? [];
        return (
          <LinkCard
            key={kind}
            kind={kind}
            url={fresh[kind]}
            activeSince={active[0]?.created_at}
            onCreate={() => create(kind)}
          />
        );
      })}
    </main>
  );
}

function LinkCard({ kind, url, activeSince, onCreate }: { kind: Kind; url?: string; activeSince?: string; onCreate: () => void }) {
  const toast = useToast();
  const [svg, setSvg] = useState("");
  useEffect(() => {
    if (url) QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#1d3d4d", light: "#0000" } }).then(setSvg);
  }, [url]);
  const info = KINDS[kind];
  const since = activeSince ? new Date(activeSince).toLocaleDateString("pl-PL", { day: "numeric", month: "long" }) : null;
  return (
    <section className="link-card">
      {svg ? <div className="qr-box" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="qr-box empty-qr" aria-hidden="true">QR pojawi się po utworzeniu linku</div>}
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <h2>{info.title}</h2>
        <p className="hint">{info.help}</p>
        {url ? (
          <>
            <div className="url">
              <code>{url}</code>
              <button className="btn" onClick={() => navigator.clipboard?.writeText(url).then(() => toast("Link skopiowany."))}>Kopiuj</button>
            </div>
            <p className="hint">Zapisz go teraz — ze względów bezpieczeństwa pokazujemy go tylko raz.</p>
          </>
        ) : (
          <p>{since ? `Link działa od ${since}. Jeśli go zgubiłeś albo trafił do niewłaściwej osoby, utwórz nowy — stary przestanie działać.` : "Nie ma jeszcze linku."}</p>
        )}
        <div>
          <button className="btn primary" onClick={onCreate}>{since || url ? "Utwórz nowy link" : "Utwórz link"}</button>
        </div>
      </div>
    </section>
  );
}
