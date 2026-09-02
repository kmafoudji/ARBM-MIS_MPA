/**
 * Partner band — "A development initiative by" + the six LLF donors.
 * Mirrors the white logo band of the official LLF template (design.md §5.1);
 * the logos are the ones already shipped in public/logos/donors (see
 * public/logos/PROVENANCE.md), in the template's order.
 */
import { useTranslation } from "react-i18next";

const DONORS = [
  { file: "ksrelief", name: "King Salman Humanitarian Aid & Relief Centre" },
  { file: "adfd",     name: "Abu Dhabi Fund for Development" },
  { file: "gates",    name: "Bill & Melinda Gates Foundation" },
  { file: "isfd",     name: "Islamic Solidarity Fund for Development" },
  { file: "qffd",     name: "Qatar Fund for Development" },
  { file: "isdb",     name: "Islamic Development Bank" },
];

export default function PartnerBand({ compact = false }) {
  const { t } = useTranslation();
  return (
    <div className={`partner-band${compact ? " compact" : ""}`}>
      <div className="partner-band-label">{t("app.partner_band", "A development initiative by")}</div>
      <div className="partner-band-logos">
        {DONORS.map((d) => (
          <img
            key={d.file}
            src={`/logos/donors/${d.file}.png`}
            alt={d.name}
            title={d.name}
            loading="lazy"
          />
        ))}
      </div>
    </div>
  );
}
