# Marque — contrat d'identité

Référence faisant autorité pour le **nom**, la **promesse**, la **voix**, le **mark** et le **système de partage** de The Box. Document destiné aux développeurs, aux designers et à toute personne qui écrit une chaîne visible par un joueur.

> **Règle d'or.** Une tagline, un registre, un mark. Toute chaîne de marque passe par les constantes de `packages/types/src/index.ts` (canonique), leur miroir `packages/frontend/src/lib/brand.ts`, ou un fichier de locale. Une tagline écrite en dur dans un composant, une route ou un manifest est un bug.

Ce document est la couche **marque**. `docs/ui-tokens.md` est la couche **valeurs** (couleurs, ombres, rayons). `docs/oxygen-design-system.md` est la couche **principes** (accessibilité, hiérarchie d'actions). En cas de conflit sur une couleur, `ui-tokens.md` gagne ; sur une formulation, ce document gagne.

---

## 1. Le nom

**The Box.** Pas « TheBox », pas « the box », pas « La Boîte » — le nom ne se traduit pas, y compris en français.

Le nom n'était pas descriptif ; il l'est devenu par ce que la boîte **fait** :

> Chaque jour à minuit UTC, une boîte s'ouvre. La même pour tout le monde. Puis elle se referme.

C'est le seul sens officiel du nom. Le cube du logo **est** cette boîte.

### Le verbe

**« Ouvre la boîte. »** / **« Open the box. »**

Le verbe est la formule d'appel du produit. Il s'emploie partout où l'on invite à jouer : CTA primaire, notification push, e-mail de relance, carte sociale.

| Objet | Formulation retenue | Ne pas écrire |
|---|---|---|
| Le défi quotidien | la boîte du jour · today's box | « le challenge », « la partie du jour » |
| La série | 14 boîtes d'affilée · 14 boxes in a row | « série de 14 » seul |
| L'archive Premium | toutes les boîtes · every box | « l'historique complet » |
| Une partie de rattrapage | la boîte du {date} · the {date} box | « rejouer hier » |

### Où la langue « boîte » est obligatoire — et où « défi » reste correct

La boîte est un **mot d'invitation**, pas un renommage global de la mécanique.

| Obligatoire | Sections / surfaces |
|---|---|
| Partout où l'on invite à jouer | hero et CTA, `history`, `leaderboard`, `onboarding`, `tour`, `guestGate`, `streakRisk`, `emailConsent`, `pushNotifications`, push et e-mails serveur, texte de partage |

| « Défi » reste le terme descriptif | Pourquoi |
|---|---|
| `seo` | Les descriptions de recherche s'adressent à quelqu'un qui ne connaît pas encore le produit : « défi quotidien de jeux vidéo » porte le mot-clé, « boîte » ne le porte pas. |
| `legal` | Le texte contractuel ne se reformule pas pour une raison de ton. |
| `admin` | Surface interne. Le vocabulaire y suit le modèle de données (`challenge`), pas la marque. |
| `apiErrors` | Messages techniques mappés sur des codes serveur. |
| `achievements` | Descriptions de conditions de déblocage, pas des invitations. Les six succès de démarrage sont l'exception : ils parlent au joueur à sa première partie. |
| `pricing` | Surface contractuelle (§3), registre vouvoiement. |

### Séparation lexicale obligatoire : boîte ≠ coffre

En français gaming, « boîte » frôle la *loot box* — connotation hasard-et-argent que le produit ne veut pas.

- **Boîte** = le défi quotidien. Gratuit, déterministe, identique pour tous. Jamais une récompense.
- **Coffre** = une récompense (chest du jour 7, `rewards`). Jamais le défi.

Les deux mots **ne se croisent jamais dans la même phrase**. Une récompense ne « sort » pas d'une boîte ; elle est gagnée en ouvrant des boîtes.

### La ligne de catégorie

Le nom ne dit pas la catégorie, et il n'a pas à le faire — c'est le rôle de la ligne qui l'accompagne dans les titres de page et le référencement :

| Langue | Ligne de catégorie |
|---|---|
| fr | The Box — le jeu quotidien du screenshot |
| en | The Box — the daily video-game screenshot game |

C'est cette ligne qui porte les mots-clés, pas la marque. Le nom reste court et nu.

### Le nom des joueurs

**Les ninjas du screenshot** / **the screenshot ninjas.** Employé pour désigner la communauté ou un joueur performant — profil, classement, partage, messages de fin de partie. Ce n'est pas un grade ni un palier : c'est le nom collectif.

---

## 2. La promesse

Une seule tagline en production, déclinée par surface. Source canonique : `SITE_TAGLINE` et `SITE_CATEGORY` dans `@the-box/types`, lues directement par le backend. Le frontend en tient un miroir dans `src/lib/brand.ts` (le paquet `types` compile en CommonJS, Rollup ne peut pas réexporter ses valeurs) ; `brand.test.ts` vérifie que les copies ne divergent pas.

| Surface | Chaîne servie | Constante |
|---|---|---|
| Hero, carte OG, manifest PWA | **Une capture. Un jeu à deviner.** / *One screenshot. One guess.* | `SITE_TAGLINE` |
| Titre de page, SEO, JSON-LD | **The Box — le jeu quotidien du screenshot** | `SITE_CATEGORY` |
| CTA primaire | **Ouvre la boîte du jour** / *Open today's box* | `home.playToday` |
| Sous-titre du hero | **Voyons si ta culture gaming tient encore debout.** | `home.subtitle` |
| Partage de résultat | **J'ai ouvert la boîte du {date} — {score} pts, {n}/10.** | `share.result` |

**Interdit** : réécrire la tagline dans `index.html`, `vite.config.ts`, `og.routes.ts`, `RouteSeo.tsx` ou un composant. Le test `packages/frontend/src/lib/brand.test.ts` échoue si une variante littérale réapparaît.

### Ce qu'on ne dit pas

- **Pas de liste de fonctionnalités en tagline.** « Défi quotidien, classements en direct, succès à débloquer » décrit un backlog, pas une promesse.
- **Pas d'étiquette de catégorie en guise de promesse.** « Daily Video Game Guessing Challenge » nomme le rayon, pas le jeu.
- **Pas de promesse de fonctionnalité absente.** Toute chaîne décrivant une feature doit correspondre à du code livré et actif.

---

## 3. La voix

### La frontière : le jeu tutoie, le contrat vouvoie

Un défi parle à un joueur. Des CGU parlent à un cocontractant. Cette ligne classe les 2 300+ chaînes sans arbitrage au cas par cas.

| Registre | Sections i18n | Pourquoi |
|---|---|---|
| **Tu** — le jeu | `home` · `game` · `geo` · `geogamers` · `history` · `profile` · `achievements` · `rewards` · `dailyLogin` · `onboarding` · `tour` · `leaderboard` · `share` · `streakRisk` · `guestGate` · `publicProfile` · `personalBests` · `advancedStats` · `notifications` · `premiumGate` · `themes` · `party` | Le produit met au défi. Un défi ne vouvoie pas. |
| **Vous** — le contrat | `legal` · `auth` · `security` · `pricing` · `premium` · `accountData` · `editProfile` · `emailConsent` · `consent` · `pushNotifications` · `streamerKit` · `admin` · `report` · `seo` · `errors` · `apiErrors` | Argent, données, identité, conformité. Le vouvoiement y est un signal de sérieux. |

`seo` reste au vouvoiement : les descriptions de résultats de recherche s'adressent à un visiteur qui n'est pas encore joueur.

**Une section ne mélange jamais les deux registres.** Si une nouvelle section ne rentre dans aucune colonne, elle est ajoutée à ce tableau dans la même PR que sa première chaîne.

### Ton

1. **Le défi avant la description.** « Voyons si ta culture gaming tient encore debout » plutôt que « testez vos connaissances ».
2. **Concret avant qualitatif.** Une seconde, un score, une date, un rang. Pas « rapidement », « beaucoup », « de nombreux ».
3. **L'anglais porte le même ton que le français.** L'anglais n'est pas une traduction de la fiche produit : c'est la même voix. Si la chaîne EN pourrait être copiée telle quelle par un concurrent, elle est à réécrire.
4. **Pas d'excuse dans une erreur.** Ce qui s'est passé, et quoi faire. Pas « désolé », pas « oups ».

---

## 4. Le mark

`packages/frontend/public/logo.svg` — un cube filaire. C'est la boîte, pas une décoration.

| Variante | Fichier | Quand |
|---|---|---|
| Fermée | `logo.svg` | Par défaut : header, favicon, OG, manifest |
| Entrouverte | `logo-open.svg` | La boîte du jour n'a pas encore été jouée (header, teaser d'accueil) |

**Règles :**

- Le trait utilise le dégradé `--brand-purple` → `--brand-pink`, figé dans le SVG. Jamais de mark monochrome blanc en surface produit.
- **Le mark ne prend jamais la couleur d'un thème Premium.** Le chrome de marque (header, lockup, cartes de partage) est peint avec `--brand-purple` / `--brand-pink`, tokens que les thèmes n'ont pas le droit de redéfinir — voir `docs/ui-tokens.md`, section « Couleurs de marque ». `--primary` change avec le thème ; `--brand-*` non.
- Le lockup (`src/components/layout/BrandLockup.tsx`) est mark + wordmark, cliquable vers l'accueil. Il est présent dans le header sur **toutes** les pages. Le hero de l'accueil ne répète pas le wordmark.
- Taille minimale du mark : 24 px. En dessous, le filaire se referme visuellement.

---

## 5. Le partage

Le partage est la principale surface d'exposition de la marque : la plupart des impressions se font hors de l'app.

- **Carte OG quotidienne** (`og.routes.ts`) : la capture du jour, floutée, en fond ; wordmark ; `SITE_TAGLINE` ; CTA. Jamais une carte purement textuelle quand une capture est disponible.
- **Texte de partage** : `J'ai ouvert la boîte du {date} — {score} pts, {n}/10.` Une date, un score, un verbe. Pas d'emoji dans la phrase de base.
- **UTM obligatoires** sur tout lien `/share/*` sortant, sans quoi la boucle n'est pas mesurable : `?utm_source={canal}&utm_medium=share&utm_campaign=daily`.

---

## 6. Décisions ouvertes

Consignées ici pour qu'elles ne se reperdent pas. Voir `tasks/product-identity-revamp-proposal.html` pour le contexte complet.

| # | Décision | État |
|---|---|---|
| 1 | Adopter « boîte » comme verbe de marque | **Prise** — ce document |
| 2 | Nom public du mode ex-« GeoGamers » | **Prise** — *Panorama* (le mode appelait déjà sa capture un panorama). Change via `common.panorama` + `PANORAMA_PATH` ; les identifiants internes restent `geogamers`. |
| 3 | Sunset du Géo communautaire | **Prise** — `GEO_COMMUNITY_ENABLED` par défaut à `false`. Plan de sortie des contributeurs dans `tasks/prd-geo-community-sunset.md` : les récompenses gagnées sont dans l'inventaire et survivent, seul le badge de palier disparaît. |
| 4 | Registre du classement et du partage | **Prise** — tutoiement (ce sont des surfaces de jeu) |

---

## 7. Checklist de revue

Avant de merger une PR qui touche une chaîne visible par un joueur :

- [ ] Aucune tagline littérale ajoutée hors de `SITE_TAGLINE` / `SITE_CATEGORY`
- [ ] Le registre de la chaîne correspond à la section du tableau §3
- [ ] « Boîte » ne désigne pas une récompense, « coffre » ne désigne pas le défi
- [ ] La chaîne EN porte le ton, pas la fiche produit
- [ ] Aucune feature décrite qui ne soit livrée et active
- [ ] Aucun `--primary` utilisé pour du chrome de marque (utiliser `--brand-*`)
