# gigit

Visualiseur Git local **en lecture seule** (type GitKraken, sans lien avec lui). Aucune commande Git qui écrit (pas de stage, commit, checkout…) : toute action d'écriture serait une nouvelle fonctionnalité à valider avec l'utilisateur.

## Stack

- Front : Vite 8 + React 19 + TypeScript + Tailwind v4 + shadcn/ui (style `radix-nova`, icônes lucide). `cn` vient du paquet `cn`.
- Back : Node sans dépendance, ESM (`server/`). Lance `git` via `execFile` (jamais de shell).
- Thème : `ThemeProvider` maison (`src/components/theme-provider.tsx`, clé `gigit.theme`, sombre par défaut). Sonner utilise ce provider, pas `next-themes`.
- Couleurs : le thème sombre reprend le terminal de l'utilisateur (Ghostty « Atom One Dark », fond `#323844`). Couleurs Git via les tokens `git-add`/`git-del`/`git-mod`/`git-info` et les couloirs via `--lane-0…9` (`src/index.css`) : pas de couleur Tailwind codée en dur.

## Structure

- `server/git.js` : requêtes Git en lecture + parseurs (refs, status `-z`, log, name-status/numstat `-z`).
- `server/api.js` : middleware connect-style `/api/*` partagé par le dev et la prod. Récents et workspaces dans `~/.config/gigit/state.json` (écritures sérialisées par `updateState`).
- `server/scan.js` : détection récursive des dépôts d'un dossier (imbriqués compris, `node_modules`/`vendor`/dossiers cachés ignorés, chemins réels via `realpath`).
- `server/index.js` : serveur de prod (port 8790) qui sert `dist/` et ouvre le navigateur ; aussi la commande `gigit`.
- `vite.config.ts` : branche le même middleware dans Vite (port 8791).
- `src/lib/graph.ts` : placement des commits en couloirs + chemins SVG (coudes arrondis). `ROW_H` doit rester égal à la hauteur des lignes.
- `src/hooks/use-repo.ts` : chargement du dépôt (cache par dépôt : changer d'onglet n'est qu'une vérification d'empreinte), polling de l'empreinte (`/api/fingerprint`, 3 s), cache des détails de commit, texte des diffs.
- `src/hooks/use-workspaces.ts` : workspaces (CRUD), dépôts détectés (rescan au focus, 30 s mini), résumés de statut (`/api/summaries`, 30 s).
- `src/App.tsx` : workspace courant, onglets par workspace (localStorage `gigit.workspace` / `gigit.tabs`), état de vue par dépôt (`views` : sélection, diff, recherche, pagination ; scroll dans `scrollTops`), clavier, panneaux.
- `?open=<chemin>` (commande `gigit <chemin>`) : scan du dossier ; un dépôt → onglet, plusieurs → `FoundDialog`.

## Conventions

- Prettier du projet : pas de point-virgule, guillemets doubles, largeur 80 (`npm run format`).
- Lint React 19 strict : pas de `setState` synchrone dans un effet, pas de réassignation dans une closure de `useMemo` ; mettre à jour l'état dans les callbacks de promesse.
- Sécurité API : hôte `localhost`/`127.0.0.1` uniquement + en-tête `X-Gigit: 1` obligatoire (bloque les requêtes cross-site).
- Query params : un seul mot (`repo`, `hash`, `path`, `orig`, `mode`, `limit`) ; en snake_case s'il en faut un composé.
- Interface en français.

## Vérifier

`npx tsc -b && npx eslint . && npm run build`

## Dépôts

- GitLab (principal) : https://gitlab.com/AnselmeSDR/gigit (`git@gitlab.com:AnselmeSDR/gigit.git`)
- GitHub (miroir) : https://github.com/AnselmeSDR/gigit
- `origin` a deux URL de push : un `git push` envoie aux deux.
- Dépôts publics, licence GPL-3.0 : rien de professionnel ni de personnel dans le code, la doc ou les commits. Identité git locale : `Anselme SDR <anselme8@icloud.com>`.
