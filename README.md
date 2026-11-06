# gigit

Visualiseur Git local, en lecture seule : graphe des commits, détail d'un commit, diff, modifications en cours.

## Lancer

```sh
npm install
npm run dev            # dev : http://127.0.0.1:8791 (API servie par Vite)
npm run build && npm start [chemin]   # prod : http://127.0.0.1:8790
```

Pour avoir la commande `gigit` partout : `npm run build && npm link`, puis `gigit .` dans n'importe quel dossier.
Si le serveur tourne déjà, la commande ouvre simplement le navigateur sur le dossier demandé.

## Fonctions

- Ouvrir un dossier (Finder, chemin collé, récents) détecte tous les dépôts qu'il contient, y compris imbriqués (un checkout Dolibarr et ses modules). Un seul dépôt s'ouvre directement ; plusieurs proposent de créer un workspace.
- Workspaces (Pro, Perso, Dolibarr v22…) : un nom et des dossiers, dont les dépôts sont redétectés automatiquement ; on peut en masquer. Enregistrés dans `~/.config/gigit/state.json`.
- Onglets : plusieurs dépôts ouverts par workspace, chacun garde sa sélection, sa recherche et sa position.
- Barre latérale : dépôts du workspace en arbre (branche, modifications, avance/retard), puis branches locales, remotes, tags, stashes du dépôt ouvert.
- Graphe : couloirs colorés, étiquettes de branches/tags, HEAD, ligne « WIP » pour les modifications non commitées.
- Détail : message, auteur, dates, parents, fichiers modifiés (+/−) ; un clic ouvre le diff.
- Recherche (message, auteur, SHA, branche), rafraîchissement automatique quand le dépôt change.

## Raccourcis

| Touche            | Action                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| `↑` `↓` / `j` `k` | Commit précédent / suivant                                             |
| `/`               | Rechercher (`Entrée` / `Maj+Entrée` pour naviguer entre les résultats) |
| `Échap`           | Fermer le diff, vider la recherche                                     |
| `d`               | Thème clair / sombre                                                   |

## Licence

[AGPL-3.0](LICENSE) — libre d'utiliser, de modifier et de partager ; toute version modifiée, distribuée ou proposée en ligne doit rester open source sous la même licence. Une licence commerciale est disponible pour un usage en code fermé : anselme8@icloud.com.
