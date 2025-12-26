import { TemplateCard, Template } from "@/components/template-card";

export function TemplateList({ templates }: { templates: Template[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {templates.map((template) => (
        <TemplateCard key={`${template.name}-${template.color}`} template={template} />
      ))}
    </div>
  );
}
