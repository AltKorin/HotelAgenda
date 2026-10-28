"""Image uploads (logos, hotel slides) — an untrusted-file boundary.

Every file is opened by Pillow, size-checked and re-encoded, so what we store and serve is an image
we produced: no metadata, no polyglot files, no SVG with scripts. The client's file name is never used.
"""

import io
import uuid
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from PIL import Image, UnidentifiedImageError

from core.domain_errors import DomainError

ACCEPTED = {"PNG", "JPEG", "WEBP"}
MAX_PIXELS = 25_000_000  # decompression-bomb guard (a 5000×5000 image)


@dataclass(frozen=True)
class Kind:
    folder: str
    max_mb: int
    box: tuple[int, int]  # downscale to fit, never upscale
    format: str  # PNG keeps logo transparency; JPEG keeps photo slides small
    label: str
    missing: str


LOGO = Kind("logos", 2, (1200, 1200), "PNG", "Logo", "Wybierz plik z logo")
SLIDE = Kind("slides", 5, (1920, 1080), "JPEG", "Slajd", "Wybierz plik ze slajdem")


@dataclass(frozen=True)
class Saved:
    url: str
    width: int
    height: int


def save_image(upload, kind):
    if upload is None:
        raise DomainError(kind.missing)
    limit = kind.max_mb * 1024 * 1024
    too_big = f"{kind.label} może mieć najwyżej {kind.max_mb} MB"
    if upload.size > limit:
        raise DomainError(too_big)
    raw = upload.read(limit + 1)
    if len(raw) > limit:
        raise DomainError(too_big)
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            fmt, (width, height) = probe.format, probe.size
            if fmt not in ACCEPTED:
                raise DomainError(f"Wgraj {kind.label.lower()} jako PNG, JPG albo WebP")
            if width * height > MAX_PIXELS:
                raise DomainError("Obraz jest za duży (maksymalnie 25 megapikseli)")
            probe.verify()
        with Image.open(io.BytesIO(raw)) as image:
            image.load()
            image = image.convert("RGBA" if kind.format == "PNG" else "RGB")
            image.thumbnail(kind.box)
            out = io.BytesIO()
            if kind.format == "PNG":
                image.save(out, "PNG", optimize=True)
            else:
                image.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    except DomainError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise DomainError("To nie jest obraz PNG, JPG ani WebP") from None
    folder = Path(settings.MEDIA_ROOT) / kind.folder
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{'png' if kind.format == 'PNG' else 'jpg'}"
    (folder / name).write_bytes(out.getvalue())
    return Saved(f"{settings.MEDIA_URL}{kind.folder}/{name}", *image.size)


def save_logo(upload):
    # ponytail: replaced logos stay on disk — published snapshots may still point at them; a cleanup
    # command can sweep files nothing references if the folder ever grows.
    return save_image(upload, LOGO).url


def delete_file(url, folder=SLIDE.folder):
    """Remove an uploaded file we own (slides are live, never inside a publication)."""
    prefix = f"{settings.MEDIA_URL}{folder}/"
    if url.startswith(prefix) and "/" not in url[len(prefix):]:
        (Path(settings.MEDIA_ROOT) / folder / url[len(prefix):]).unlink(missing_ok=True)


def delete_unused(urls):
    """After a hotel is deleted: drop its logos and slides unless another hotel still points at them
    (setup_hotel may give several hotels the same file)."""
    from .models import Group, Hotel, HotelSlide

    for url in set(urls):
        if Hotel.objects.filter(logo=url).exists() or Group.objects.filter(organizer_logo=url).exists() \
                or HotelSlide.objects.filter(image=url).exists():
            continue
        for folder in (LOGO.folder, SLIDE.folder):
            delete_file(url, folder)
