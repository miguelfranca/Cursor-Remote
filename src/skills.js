import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function listSkills(workspace) {
  const roots = [
    join(homedir(), ".cursor", "skills"),
    join(homedir(), ".agents", "skills"),
  ];
  if (workspace) {
    roots.push(join(workspace, ".cursor", "skills"), join(workspace, ".agents", "skills"));
  }
  const skills = [];
  const seen = new Set();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = join(root, entry.name, "SKILL.md");
      if (!existsSync(file)) continue;
      const skill = readSkill(file, entry.name);
      if (seen.has(skill.name)) continue;
      seen.add(skill.name);
      skills.push(skill);
    }
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export function skillBodies(workspace, names) {
  const wanted = new Set(names);
  return listSkills(workspace).filter((skill) => wanted.has(skill.name));
}

function readSkill(file, fallback) {
  const text = readFileSync(file, "utf8");
  const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim() || fallback;
  const description = /^description:\s*(.+)$/m.exec(text)?.[1]?.trim() || "";
  return { name, description, body: text };
}

export function composePrompt(text, skills) {
  if (skills.length === 0) return text;
  const prefix = skills.map((skill) => `Skill ${skill.name}:\n${skill.body}`).join("\n\n");
  return `${prefix}\n\n${text}`;
}
