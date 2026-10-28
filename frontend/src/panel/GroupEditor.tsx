import QRCode from "qrcode";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LookPicker, ScaledDay, type Look } from "../screen/LookPicker.tsx";
import { daySlides, daysBetween, localDate, placesText } from "../screen/slides.ts";
import { resolveFonts, themeById } from "../screen/themes.ts";
import type { DaySlide, ScreenData, ScreenGroup } from "../screen/types.ts";
import { ApiError, api, upload, useApi, type EditorPoint, type GroupDetail, type Hotel, type Kind, type Link, type Space, type Typical } from "./api.ts";
import PointDrawer, { type PointBody } from "./PointDrawer.tsx";
import { go, linkTo } from "./router.ts";
import { displayTime, plural } from "./time.ts";
import { Dialog, Field, LogoField, dateRange, dayTab, useToast } from "./ui.tsx";

type Drawer = { point: EditorPoint | null } | null;

export default function GroupEditor({ hotel, groupId }: { hotel: Hotel; groupId: string }) {
  const base = `/hotels/${hotel.id}/groups/${groupId}`;
  const detail = useApi<GroupDetail>(`${base}/`);
  const spaces = useApi<Space[]>(`/hotels/${hotel.id}/spaces/`);
  const kinds = useApi<Kind[]>("/point-kinds/");
  const toast = useToast();
  const [day, setDay] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [dialog, setDialog] = useState<"data" | "look" | "guest" | "typical" | "preview" | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  const group = detail.data;
  const days = useMemo(() => (group ? daysBetween(group.first_day, group.last_day) : []), [group]);
  const today = localDate(new Date(), hotel.timezone);
  const current = day && days.includes(day) ? day : days.includes(today) ? today : days[0];
  const spaceName = useMemo(() => new Map((spaces.data ?? []).map((s) => [s.id, s.name])), [spaces.data]);

  if (detail.error) return <main className="page"><p className="error">{detail.error}</p></main>;
  if (!group || !kinds.data || !spaces.data) return null;

  /** Every change: send with the version we saw; 409 means someone else saved first. */
  const mutate = async (fn: (version: number) => Promise<unknown>, message: string): Promise<string | null> => {
    setBusy(true);
    try {
      await fn(group.version);
      detail.reload();
      toast(message);
      return null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflict(true);
      return (err as Error).message;
    } finally {
      setBusy(false);
    }
  };

  const savePoint = (id: string | null, body: PointBody) =>
    mutate(
      (version) => (id ? api.patch(`${base}/points/${id}/`, { ...body, version }) : api.post(`${base}/points/`, { ...body, version })),
      id ? "Punkt zapisany. Goście zobaczą zmianę po opublikowaniu." : "Punkt dodany. Goście zobaczą go po opublikowaniu.",
    );
  const deletePoint = (id: string) => mutate((version) => api.delete(`${base}/points/${id}/`, { version }), "Punkt usunięty.");
  const publish = () =>
    mutate(
      (version) => api.post(`${base}/publish/`, { version }),
      "Opublikowano. Ekran w holu i telefony gości pokażą zmiany w ciągu minuty.",
    );

  const points = group.points.filter((p) => (p.starts_at ?? p.ends_at ?? "").slice(0, 10) === current);
  const countFor = (d: string) => group.points.filter((p) => (p.starts_at ?? p.ends_at ?? "").slice(0, 10) === d).length;

  return (
    <main className="page">
      <p style={{ margin: "0 0 12px" }}>
        <a {...linkTo("/panel")} className="hint">
          ← Wszystkie grupy
        </a>
      </p>
      <div className="page-head group-head">
        <div>
          <h1>{group.name}</h1>
          <p className="sub">
            <span>{dateRange(group.first_day, group.last_day)}</span>
            <span>{group.organizer.is_hotel ? "Organizuje hotel" : `Organizator: ${group.organizer.name}`}</span>
            {group.agreed && <span className="badge agreed">Uzgodniona z organizatorem</span>}
          </p>
        </div>
        <div className="group-actions">
          <button className="btn" onClick={() => setDialog("data")}>Dane grupy</button>
          <button className="btn" onClick={() => setDialog("look")}>Wygląd ekranu</button>
          <button className="btn" onClick={() => setDialog("guest")}>Link dla gości</button>
          <a className="btn" href={`/api${base}/agenda.pdf`} title="Szkic agendy do wysłania organizatorowi albo wydruku">Agenda PDF</a>
        </div>
      </div>

      {group.announcement && <p className="notice">Ogłoszenie dla gości: {group.announcement}</p>}

      <div className="day-tabs" role="tablist" aria-label="Dni pobytu">
        {days.map((d) => {
          const tab = dayTab(d);
          return (
            <button key={d} role="tab" aria-selected={d === current} onClick={() => setDay(d)}>
              <strong>{tab.weekday} {tab.date}</strong>
              <span className="count">{countFor(d) ? `${countFor(d)} ${plural(countFor(d), "punkt", "punkty", "punktów")}` : "pusto"}{d === today ? ", dziś" : ""}</span>
            </button>
          );
        })}
      </div>
      <section className="sheet" role="tabpanel">
        {points.length === 0 ? (
          <div className="empty" style={{ border: 0 }}>
            <p>Ten dzień jest pusty. Dodaj punkt albo wybierz z typowych (śniadanie, przerwa kawowa…).</p>
          </div>
        ) : (
          <ul className="agenda">
            {points.map((p) => (
              <li key={p.id}>
                <button className={`row${p.visibility === "staff" ? " staff-only" : ""}`} onClick={() => setDrawer({ point: p })}>
                  <span className="time">{displayTime(p.time_label, p.starts_at, p.ends_at)}</span>
                  <span className="title">
                    {p.title}
                    <span className="badges">
                      {p.visibility === "staff" && <span className="badge staff">tylko obsługa</span>}
                      {p.realizer === "organizer" && <span className="badge">realizuje organizator</span>}
                    </span>
                    {p.guest_note && <span className="note">{p.guest_note}</span>}
                  </span>
                  <span className="places">
                    {placesText(p.placements.map((pl) => spaceName.get(pl.space) ?? ""))}
                    {p.placements.map((pl, i) => {
                      const bits = [
                        pl.subgroup,
                        pl.headcount != null ? `${pl.headcount} os.` : "",
                        pl.responsible,
                      ].filter(Boolean);
                      return bits.length ? (
                        <span className="card" key={i}>
                          {bits.map((b) => <span key={b}>{b}</span>)}
                        </span>
                      ) : null;
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="sheet-foot">
          <button className="btn primary" onClick={() => setDrawer({ point: null })}>Dodaj punkt</button>
          <button className="btn" onClick={() => setDialog("typical")}>Z typowych punktów</button>
        </div>
      </section>

      <div className={`publish-bar${group.unpublished_changes ? " dirty" : ""}${conflict ? " conflict" : ""}`}>
        {conflict ? (
          <>
            <p>
              <strong>Ktoś inny zmienił tę agendę.</strong> Odśwież, żeby zobaczyć jego zmiany, i wprowadź swoją jeszcze raz.
            </p>
            <button className="btn primary" onClick={() => { setConflict(false); detail.reload(); }}>Odśwież</button>
          </>
        ) : (
          <>
            <p>
              {group.unpublished_changes ? (
                <><strong>Zmiany nie są jeszcze widoczne dla gości.</strong> Ekran i telefony pokazują ostatnią opublikowaną wersję.</>
              ) : (
                <>Goście widzą aktualną agendę.</>
              )}
            </p>
            <button className="btn" onClick={() => setDialog("preview")}>Podgląd dla gości</button>
            <button className="btn publish" disabled={!group.unpublished_changes || busy} onClick={publish}>Opublikuj</button>
          </>
        )}
      </div>

      {drawer && <PointDrawer
        open
        point={drawer.point}
        day={current}
        days={days}
        kinds={kinds.data}
        spaces={spaces.data}
        kartaUrl={drawer.point ? `/api${base}/points/${drawer.point.id}/karta.pdf` : undefined}
        onClose={() => setDrawer(null)}
        onSave={async (body) => {
          const error = await savePoint(drawer.point?.id ?? null, body);
          if (!error) setDrawer(null);
          return error;
        }}
        onDelete={async () => {
          const error = await deletePoint(drawer.point!.id);
          if (!error) setDrawer(null);
          return error;
        }}
        onAddSpace={async (name) => {
          const space = await api.post<Space>(`/hotels/${hotel.id}/spaces/`, { name });
          spaces.set([...(spaces.data ?? []), space].sort((a, b) => a.name.localeCompare(b.name, "pl")));
          return space;
        }}
      />}
      <GroupData
        group={group}
        hotel={hotel}
        open={dialog === "data"}
        onClose={() => setDialog(null)}
        save={(body) => mutate((version) => api.patch(`${base}/`, { ...body, version }), "Dane grupy zapisane.")}
        remove={() =>
          mutate((version) => api.delete(`${base}/`, { version }), "Grupa usunięta. Ekran i telefony gości już jej nie pokazują.").then((e) => {
            if (!e) go("/panel");
            return e;
          })
        }
        logo={(file) =>
          mutate(
            (version) => (file ? upload(`${base}/organizer-logo/`, file, { version: String(version) }) : api.delete(`${base}/organizer-logo/`, { version })),
            file ? "Logo organizatora zapisane. Goście zobaczą je po opublikowaniu." : "Logo organizatora usunięte.",
          )
        }
      />
      {dialog === "typical" && (
        <TypicalDialog hotel={hotel} day={current} onClose={() => setDialog(null)} add={(typical) => mutate((version) => api.post(`${base}/points/from-typical/`, { typical, day: current, version }), "Punkt dodany z typowych.")} />
      )}
      {(dialog === "preview" || dialog === "look") && (
        <PreviewDialogs
          mode={dialog}
          base={base}
          hotel={hotel}
          group={group}
          day={current}
          onClose={() => setDialog(null)}
          publish={async () => { const e = await publish(); if (!e) setDialog(null); }}
          saveLook={async (look) => {
            const e = await mutate((version) => api.patch(`${base}/`, { theme: look.theme, fonts: look.fonts, version }), "Wygląd zapisany. Ekran zmieni się po opublikowaniu.");
            if (!e) setDialog(null);
          }}
        />
      )}
      {dialog === "guest" && <GuestLink hotel={hotel} group={group} onClose={() => setDialog(null)} />}
    </main>
  );
}

function GroupData({ group, hotel, open, onClose, save, logo, remove }: {
  group: GroupDetail;
  hotel: Hotel;
  open: boolean;
  onClose: () => void;
  save: (body: Record<string, unknown>) => Promise<string | null>;
  remove: () => Promise<string | null>;
  logo: (file: File | null) => Promise<string | null>;
}) {
  const [error, setError] = useState("");
  const [isHotel, setIsHotel] = useState(group.organizer.is_hotel);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const err = await save({
      name: f.get("name"),
      organizer_name: isHotel ? hotel.name : f.get("organizer"),
      organizer_is_hotel: isHotel,
      first_day: f.get("first_day"),
      last_day: f.get("last_day"),
      agreed: f.get("agreed") === "on",
      announcement: f.get("announcement"),
      welcome: f.get("welcome"),
    });
    if (err) setError(err);
    else onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Dane grupy">
      <form onSubmit={submit} style={{ display: "grid", gap: 14 }} key={group.version}>
        {error && <p className="error">{error}</p>}
        <Field label="Nazwa grupy">{(id) => <input id={id} name="name" type="text" defaultValue={group.name} required />}</Field>
        <label className="check">
          <input type="checkbox" checked={isHotel} onChange={(e) => setIsHotel(e.target.checked)} />
          Organizatorem jest hotel
        </label>
        {!isHotel && <Field label="Organizator">{(id) => <input id={id} name="organizer" type="text" defaultValue={group.organizer.name} required />}</Field>}
        {!isHotel && (
          <LogoField
            label="Logo organizatora"
            hint="Na ekranie w holu obok logo hotelu, u gości i w PDF. Zapisuje się od razu; goście zobaczą je po opublikowaniu."
            value={group.organizer.logo}
            onUpload={(file) => logo(file)}
            onRemove={() => logo(null)}
          />
        )}
        <div className="grid-2">
          <Field label="Przyjazd">{(id) => <input id={id} name="first_day" type="date" defaultValue={group.first_day} required />}</Field>
          <Field label="Wyjazd">{(id) => <input id={id} name="last_day" type="date" defaultValue={group.last_day} required />}</Field>
        </div>
        <label className="check">
          <input type="checkbox" name="agreed" defaultChecked={group.agreed} />
          Agenda uzgodniona z organizatorem
        </label>
        <Field label="Ogłoszenie dla gości" hint="Pokazuje się nad agendą na ekranie i w telefonie, np. zmiana sali. Zostaw puste, gdy nic się nie zmienia.">
          {(id) => <input id={id} name="announcement" type="text" defaultValue={group.announcement} maxLength={300} />}
        </Field>
        <Field label="Powitanie na ekranie" hint="Widać je, gdy nie ma ogłoszenia.">
          {(id) => <input id={id} name="welcome" type="text" defaultValue={group.welcome} maxLength={300} />}
        </Field>
        <div className="dialog-actions">
          {confirmDelete ? (
            <button type="button" className="btn danger" onClick={async () => { const e = await remove(); if (e) setError(e); }}>
              Usuń grupę razem z {group.points.length} punktami
            </button>
          ) : (
            <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>Usuń grupę</button>
          )}
          <button type="button" className="btn quiet" onClick={onClose}>Anuluj</button>
          <button className="btn primary">Zapisz</button>
        </div>
        {confirmDelete && (
          <p className="hint">
            Usunięcie zabierze też publikacje i link dla gości — ekran w holu i telefony przestaną pokazywać tę grupę. Tego nie da się cofnąć.
          </p>
        )}
      </form>
    </Dialog>
  );
}

function TypicalDialog({ hotel, day, onClose, add }: { hotel: Hotel; day: string; onClose: () => void; add: (id: string) => Promise<string | null> }) {
  const typical = useApi<Typical[]>(`/hotels/${hotel.id}/typical-points/`);
  const [error, setError] = useState("");
  const tab = dayTab(day);
  return (
    <Dialog open onClose={onClose} title={`Typowe punkty na ${tab.weekday} ${tab.date}`}>
      {error && <p className="error">{error}</p>}
      {typical.data?.length === 0 && <p className="hint">Hotel nie ma jeszcze typowych punktów. Dodaje je obsługa serwisowa.</p>}
      <ul className="typical-list">
        {typical.data?.map((t) => (
          <li key={t.id}>
            <button onClick={async () => { const e = await add(t.id); if (e) setError(e); else onClose(); }}>
              <strong>{t.title}</strong>
              <span className="hint">{t.end_time ? `${t.start_time}–${t.end_time}` : t.start_time}{t.space ? `, ${t.space}` : ""}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function asScreenData(hotel: Hotel, group: ScreenGroup): ScreenData {
  return {
    hotel: { name: hotel.name, logo: hotel.logo, timezone: hotel.timezone },
    slide_seconds: 12,
    refresh_seconds: 60,
    groups: [group],
    hotel_slides: [],
  };
}

/** „Podgląd dla gości” and „Wygląd ekranu” both render the draft as guests would see it. */
function PreviewDialogs({ mode, base, hotel, group, day, onClose, publish, saveLook }: {
  mode: "preview" | "look";
  base: string;
  hotel: Hotel;
  group: GroupDetail;
  day: string;
  onClose: () => void;
  publish: () => void;
  saveLook: (look: Look) => void;
}) {
  const preview = useApi<Omit<ScreenGroup, "guest_url">>(`${base}/preview/?v=${group.version}`);
  const [now] = useState(() => new Date());
  const theme = themeById(group.theme);
  const [look, setLook] = useState<Look>({ theme: theme.id, fonts: resolveFonts(theme, group.fonts).id });
  const [shown, setShown] = useState(day);
  if (!preview.data) return null;
  const screenGroup: ScreenGroup = { ...preview.data, guest_url: `${window.location.origin}/g/podglad` };
  const data = asScreenData(hotel, screenGroup);
  const slides = daySlides(screenGroup, hotel.timezone);
  const slide: DaySlide | null = slides.find((s) => s.date === shown) ?? slides[0] ?? null;

  if (mode === "look")
    return (
      <Dialog open wide onClose={onClose} title="Wygląd ekranu dla tej grupy">
        <div className="picker" style={{ position: "static", padding: 0, background: "none" }}>
          <LookPicker value={look} onChange={setLook} slide={slide} data={data} now={now} />
        </div>
        <div className="dialog-actions">
          <button className="btn quiet" onClick={onClose}>Anuluj</button>
          <button className="btn primary" onClick={() => saveLook(look)}>Zapisz wygląd</button>
        </div>
      </Dialog>
    );

  return (
    <Dialog open wide onClose={onClose} title="Tak zobaczą to goście">
      <p className="hint" style={{ margin: 0 }}>
        To szkic: ekran i telefony pokażą go dopiero po opublikowaniu. Karty zlecenia i punkty „tylko obsługa” nie są widoczne dla gości.
      </p>
      <div className="preview-days">
        {slides.map((s) => {
          const tab = dayTab(s.date);
          return (
            <button key={s.date} className={`btn${s.date === slide?.date ? " primary" : ""}`} onClick={() => setShown(s.date)}>
              {tab.weekday} {tab.date}
            </button>
          );
        })}
      </div>
      {slide ? <ScaledDay slide={slide} data={data} now={now} /> : <p className="empty">Nie ma jeszcze punktów dla gości.</p>}
      <div className="dialog-actions">
        <button className="btn quiet" onClick={onClose}>Zamknij</button>
        {group.unpublished_changes && <button className="btn publish" onClick={publish}>Opublikuj</button>}
      </div>
    </Dialog>
  );
}

function GuestLink({ hotel, group, onClose }: { hotel: Hotel; group: GroupDetail; onClose: () => void }) {
  const links = useApi<Link[]>(`/hotels/${hotel.id}/links/`);
  const toast = useToast();
  const link = links.data?.find((l) => l.kind === "guest" && l.group === group.id);
  const url = link?.token ? `${window.location.origin}/g/${link.token}` : "";
  const [svg, setSvg] = useState("");
  useEffect(() => {
    if (url) QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#1d3d4d", light: "#0000" } }).then(setSvg);
  }, [url]);
  const create = async () => {
    await api.post(`/hotels/${hotel.id}/links/`, { kind: "guest", group: group.id });
    links.reload();
  };
  const renew = async () => {
    if (link) await api.post(`/hotels/${hotel.id}/links/${link.id}/revoke/`);
    await create();
    toast("Stary link przestał działać. Wydrukuj nowe karty z kodem QR.");
  };
  return (
    <Dialog open onClose={onClose} title="Link dla gości">
      <p className="hint" style={{ margin: 0 }}>
        Goście otwierają agendę z kodu QR — na karcie meldunkowej, w pokoju albo na ekranie w holu. Bez logowania i bez aplikacji.
      </p>
      {links.data && !link && (
        <button className="btn primary" onClick={create}>Utwórz link dla gości</button>
      )}
      {url && (
        <div className="link-card" style={{ padding: 0, border: 0 }}>
          <div className="qr-box" dangerouslySetInnerHTML={{ __html: svg }} />
          <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <div className="url">
              <code>{url}</code>
              <button className="btn" onClick={() => navigator.clipboard?.writeText(url).then(() => toast("Link skopiowany."))}>Kopiuj</button>
            </div>
            <p className="hint">Link przestaje działać kilka dni po wyjeździe grupy.</p>
            <a className="btn primary" href={`/api/hotels/${hotel.id}/groups/${group.id}/karty-qr.pdf`}>Karty z kodem QR do druku (PDF)</a>
            <button className="btn danger" onClick={renew}>Unieważnij i utwórz nowy</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
