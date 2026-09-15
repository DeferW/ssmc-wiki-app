import { formatNumber } from "../../equipment/format";
import { xenoCasteLabel, type MobCatalog } from "../mobTypes";

export function XenoEvasionList({ catalog, loading, error }: { catalog: MobCatalog | null; loading: boolean; error: string | null }) {
  const available = catalog?.evasionSchemaVersion === 1;
  const castes = Object.values(catalog?.xenoCastes ?? {}).filter(caste =>
    typeof caste.evasion?.standing === "number" && Number.isFinite(caste.evasion.standing) && caste.evasion.standing !== 0,
  ).sort((a, b) => xenoCasteLabel(a).localeCompare(xenoCasteLabel(b), "ru"));
  return <details className="damage-build-details xeno-evasion-list">
    <summary>Уклонение ксеноморфов{available ? ` (${castes.length})` : ""}</summary>
    {!catalog ? <p className="scatter-note">{loading ? "Загрузка каталога мобов…" : error ? "Не удалось загрузить каталог мобов." : "Каталог мобов недоступен."}</p>
      : !available ? <p className="scatter-note">В опубликованном каталоге мобов пока нет данных об уклонении.</p>
      : <>
        <p className="scatter-note">Ненулевые значения для стоящей цели с учётом размера, без отдыха, невидимости и временных способностей. Плюс снижает шанс попадания, минус повышает. Значения обновляются вместе с каталогом мобов.</p>
        {castes.length ? <table><thead><tr><th>Ксеноморф / штамм</th><th>Уклонение</th></tr></thead><tbody>
          {castes.map(caste => <tr key={caste.id}><td>{xenoCasteLabel(caste)}</td><td>{caste.evasion!.standing > 0 ? "+" : ""}{formatNumber(caste.evasion!.standing)}</td></tr>)}
        </tbody></table> : <p className="scatter-note">Ксеноморфов с ненулевым базовым уклонением нет.</p>}
      </>}
  </details>;
}
