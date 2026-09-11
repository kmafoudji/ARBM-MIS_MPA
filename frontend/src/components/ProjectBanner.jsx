/**
 * ProjectBanner — the band at the top of every project screen: the project
 * name on the left, its official reference and the flag of each of its
 * countries (lead country first) on the right.
 *
 * Reads the project through the same query as ProjectDetail
 * (["project", id]), so on the project screens it costs no extra request.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Flag from "./Flag.jsx";

export default function ProjectBanner({ projectId }) {
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/`),
    enabled: !!projectId,
  });
  if (!project) return null;

  const countries = [...(project.countries_detail || [])].sort(
    (a, b) => Number(b.is_lead) - Number(a.is_lead)
  );

  return (
    <div className="project-banner">
      <div className="project-banner-name">{project.name}</div>
      <div className="project-banner-id">
        {project.official_reference_number && (
          <span className="project-banner-code text-mono">{project.official_reference_number}</span>
        )}
        {countries.map((c) => (
          <Flag key={c.id} iso2={c.iso2} size={22} title={c.is_lead ? `${c.name} (lead)` : c.name} />
        ))}
      </div>
    </div>
  );
}
