'use client';
import { useEffect, useState } from 'react';
import { FONT_LABEL, FONTS, SECTION_LABEL, THEME_LABEL, THEMES, validateTheme, type FontId, type ThemeConfig, type ThemeId } from '@/lib/theme';

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function ThemeEditor({ slug, initial, action }: { slug: string; initial: ThemeConfig; action: (fd: FormData) => Promise<void> }) {
  const [theme, setTheme] = useState<ThemeId>(initial.theme);
  const [brand, setBrand] = useState(initial.brand);
  const [accent, setAccent] = useState(initial.accent);
  const [font, setFont] = useState<FontId>(initial.font);
  const [sections, setSections] = useState(initial.sections);
  const config: ThemeConfig = { theme, brand, accent, font, sections };
  const json = JSON.stringify(config);

  // Pratinjau langsung: iframe memuat storefront asli dengan konfigurasi yang belum disimpan (?pv=).
  const [src, setSrc] = useState(`/s/${slug}?pv=${b64url(json)}`);
  useEffect(() => {
    const t = setTimeout(() => setSrc(`/s/${slug}?pv=${b64url(json)}`), 500);
    return () => clearTimeout(t);
  }, [json, slug]);

  const move = (i: number, d: -1 | 1) => setSections((s) => {
    const j = i + d;
    if (j < 0 || j >= s.length) return s;
    const n = [...s]; [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const toggle = (i: number) => setSections((s) => s.map((x, k) => (k === i ? { ...x, visible: !x.visible } : x)));
  const problem = validateTheme({ brand, accent });

  return (
    <div className="theme-grid">
      <form action={action} className="card stack">
        <h2>Tema</h2>
        <input type="hidden" name="config" value={json} />
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Pilihan tema</legend>
          {THEMES.map((t) => (
            <label key={t} className={`option ${theme === t ? 'selected' : ''}`}>
              <input type="radio" name="theme-ui" checked={theme === t} onChange={() => setTheme(t)} />
              <span>{THEME_LABEL[t]}</span>
            </label>
          ))}
        </fieldset>
        <h2>Warna dan font</h2>
        <div className="field">
          <label htmlFor="brand">Warna utama</label>
          <div className="color-row">
            <input id="brand" type="color" value={brand} onChange={(e) => setBrand(e.target.value)} />
            <code>{brand}</code>
          </div>
        </div>
        <div className="field">
          <label htmlFor="accent">Warna sekunder (aksen)</label>
          <div className="color-row">
            <input id="accent" type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
            <code>{accent}</code>
          </div>
        </div>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Font</legend>
          {FONTS.map((f) => (
            <label key={f} className={`option ${font === f ? 'selected' : ''}`}>
              <input type="radio" name="font-ui" checked={font === f} onChange={() => setFont(f)} />
              <span>{FONT_LABEL[f]}</span>
            </label>
          ))}
        </fieldset>

        <h2>Urutan beranda</h2>
        <ul className="steps" aria-label="Urutan bagian beranda">
          {sections.map((s, i) => (
            <li key={s.id} className="section-row">
              <label className="check-row grow"><input type="checkbox" checked={s.visible} onChange={() => toggle(i)} /><span>{SECTION_LABEL[s.id]}</span></label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Naikkan ${SECTION_LABEL[s.id]}`}>Naik</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label={`Turunkan ${SECTION_LABEL[s.id]}`}>Turun</button>
            </li>
          ))}
        </ul>
        {problem && <p className="error small" role="alert">{problem}</p>}
        <button type="submit" className="btn btn-block" disabled={!!problem}>Publikasikan perubahan</button>
        <p className="hint">Pratinjau di samping langsung berubah. Perubahan baru tampil ke pembeli setelah dipublikasikan.</p>
      </form>

      <section className="stack" aria-label="Pratinjau toko">
        <h2>Pratinjau</h2>
        <iframe title="Pratinjau toko" src={src} className="preview-frame" />
      </section>
    </div>
  );
}
