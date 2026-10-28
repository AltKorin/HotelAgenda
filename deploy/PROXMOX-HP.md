# HotelAgenda na proxmox-hp (192.168.1.71)

**Stan 16.10.2026:** LXC **106** `hotelagenda`, IP **192.168.1.54** (DHCP — rezerwacja na routerze do
zrobienia), Debian 13, Docker 29.9 (overlayfs), alias `hotelagenda-prod`, klucz `~/.ssh/id_ed25519_hotelagenda`.

**Etap 2 (produkcja) od 16.10, 21:30: https://agenda.sudomie.pl** — tunel `hotelagenda`
(`1016a636-aa00-4378-9989-f0b26fb95047`) założony z terminala w kontenerze cloudflared: cert konta w
`/root/.cloudflared/cert.pem` (600), konfiguracja + poświadczenia w `/opt/hotelagenda/deploy/cloudflared/`
(uid 65532, 400; wykluczone z `push.sh`), CNAME `agenda` w strefie sudomie.pl. LAN :8090 zamknięty
(port tylko na 127.0.0.1). Aktualne linki ekranu/obsługi: `/root/hotelagenda-linki.txt`; hasła kont hotelu:
`/root/hotelagenda-start.txt` (linki w nim nieaktualne). Smoke HTTPS: wszystko OK.

Tunel z terminala (zamiast panelu): `docker run --rm --user 0 -v /root/.cloudflared:/root/.cloudflared
cloudflare/cloudflared:2026.9.3 tunnel login` → link w przeglądarce → przeglądarka POBIERA `cert.pem`
(callback do serwera nie dochodzi) → `scp` na serwer do `/root/.cloudflared/`, kopię lokalną `shred -u`;
potem `tunnel create hotelagenda` i `tunnel route dns hotelagenda agenda.sudomie.pl`.

**Etap 1 (LAN) wdrożony 16.10 (historia):** `http://192.168.1.54:8090` (panel `/panel`), `.env` w `/opt/hotelagenda`
(sekrety wygenerowane na serwerze, `ADMIN_PASSWORD` konta `konrad`), hotel z `setup_hotel`, hasła kont
hotelu i linki ekranu/obsługi w `/root/hotelagenda-start.txt` (600). Backup: cron 03:15 UTC →
`deploy/backups/`. **Etap 2:** domena + `TUNNEL_TOKEN` → w `.env` przestawić na wartości z
`env.production.example` (domena, `SECURE_COOKIES=1`, `SSL_REDIRECT=1`, `HTTP_PORT=127.0.0.1:8090`),
`deploy/deploy.sh`, `setup_hotel - --links --base-url https://<domena>`, `deploy/smoke.sh https://<domena>`.

Wzór: brgollnau / Agencja Sprzątająca / NarrativeFramework (`lxc-setup.md`). Zasada: **agent nigdy nie
dostaje hypervisora** — Konrad tworzy LXC i daje alias SSH z osobnym kluczem; resztę (część A
`WDROZENIE.md`) robi agent przez ten alias.

## 1. LXC — na hypervisorze (`ssh proxmox-hp`, root)

```bash
pveam update
TMPL=$(pveam available --section system | awk '/debian-13-standard_.*_amd64/ {print $2}' | sort -V | tail -1)
echo "$TMPL"                                   # ma kończyć się _amd64 (NIE arm64 — był już taki błąd)
pveam list local | grep -q "$TMPL" || pveam download local "$TMPL"
VMID=$(pvesh get /cluster/nextid); echo "VMID=$VMID"
pct create "$VMID" "local:vztmpl/$TMPL" \
  --hostname hotelagenda \
  --cores 2 --memory 3072 --swap 1024 \
  --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1,keyctl=1 \
  --onboot 1 --start 1
pct config "$VMID" | grep -E '^(net0|features)'   # MAC do rezerwacji DHCP na routerze
```

Rozmiar: Postgres (limit 1 GB) + API z PDF-ami (512 MB) + Caddy + cloudflared ≈ 1,8 GB w pracy;
budowanie frontendu (npm/vite) potrzebuje zapasu, stąd 3 GB + 1 GB swap. Dysk 20 GB: obrazy, cache
budowania, backupy bazy (14 dni), logotypy i slajdy.

## 2. Docker w LXC — na hypervisorze, w nowym kontenerze

```bash
pct exec "$VMID" -- bash -s <<'EOF'
set -e
apt-get update
apt-get install -y ca-certificates curl openssh-server rsync
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<'SRC'
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: trixie
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
SRC
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker ssh
docker run --rm hello-world | head -2
docker info --format 'Storage driver: {{.Driver}}'   # overlay2 albo overlayfs (Docker 29+, containerd) — byle nie vfs
docker compose version
mkdir -p /opt/hotelagenda
hostname -I
EOF
```

## 3. Klucz SSH tylko do tego LXC — na laptopie (NIE na hypervisorze)

Wpisz prawdziwy numer zamiast `106` — zapis `VMID=<…>` zsh/bash czytają jako przekierowanie z pliku
i komenda pada (było 16.10). Komendę z `ssh proxmox-hp` uruchom w zwykłym terminalu: prosi o hasło,
a `!` w Claude Code nie ma TTY.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_hotelagenda -C hotelagenda-deploy -N ""
VMID=106
cat ~/.ssh/id_ed25519_hotelagenda.pub | ssh proxmox-hp \
  "pct exec $VMID -- sh -c 'mkdir -p -m 700 /root/.ssh && cat >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys'"
cat >> ~/.ssh/config <<'EOF'

Host hotelagenda-prod
  HostName <IP z kroku 2>
  User root
  IdentityFile ~/.ssh/id_ed25519_hotelagenda
  IdentitiesOnly yes
EOF
ssh hotelagenda-prod 'docker info --format "{{.Driver}}" && hostname'
```

Router: rezerwacja DHCP dla MAC z kroku 1 (inaczej IP może się zmienić po restarcie).

## 4. Cloudflare Tunnel — w panelu Cloudflare (Ty)

Zero Trust → Networks → Tunnels → *Create a tunnel* → Cloudflared → nazwa `hotelagenda` →
skopiuj **token** (nie instaluj connectora — działa jako kontener `tunnel` w Compose).
*Public Hostname*: `<domena>` → Service **HTTP** → `web:80`. SSL/TLS → Edge → *Always Use HTTPS*: on.

Token do `.env` na serwerze bez wklejania do czatu (po tym, jak agent założy `.env`):

```bash
read -rs -p "Token tunelu: " T && echo && \
ssh hotelagenda-prod "sed -i 's|^TUNNEL_TOKEN=.*|TUNNEL_TOKEN=$T|' /opt/hotelagenda/.env && grep -c '^TUNNEL_TOKEN=.\{20,\}' /opt/hotelagenda/.env"
```

## 5. Dalej robi agent (alias `hotelagenda-prod`)

`deploy/push.sh hotelagenda-prod:/opt/hotelagenda` → `.env` z `env.production.example` (sekrety
generowane na serwerze) → `deploy/deploy.sh` → admin → `setup_hotel - --enable-outputs --links …
< deploy/hotel.json` → `deploy/smoke.sh https://<domena>` → cron `backup.sh`. Szczegóły: `WDROZENIE.md`.

Rollback na poziomie hypervisora: `vzdump <VMID> --storage local --compress zstd --mode snapshot`
przed każdą większą zmianą (Ty, na proxmox-hp).
