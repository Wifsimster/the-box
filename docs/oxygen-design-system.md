# Design System Oxygen — référence des principes

Ce document reprend les principes du [design system Oxygen de Doctolib](https://oxygen.doctolib.design) et explique comment nous les appliquons à The Box. Destiné aux développeurs frontend et designers.

> **Périmètre.** Oxygen est le design system santé de Doctolib : clair, bleu, professionnel, axé WCAG-AA. The Box est un produit gaming sombre avec une identité visuelle volontairement distincte (voir `docs/ui-tokens.md`). Nous **n'adoptons pas** le langage visuel d'Oxygen. Nous adoptons ses **principes** : accessibilité d'abord, discipline des tokens, hiérarchie d'actions, arbre de décision pour le choix des composants et exceptions documentées.
>
> Les tokens, palettes et variantes shadcn/Radix restent gouvernés par `docs/ui-tokens.md`. Ce document est la couche **principes** ; `ui-tokens.md` est la couche **valeurs**.

---

## 1. Sources externes

- Oxygen public site: <https://oxygen.doctolib.design>
- Oxygen Storybook: <https://doctolib.github.io/storybook/>
- Doctolib engineering on Medium:
  - "Design System: the art of documented compromise" — <https://medium.com/doctolib/design-system-the-art-of-documented-compromise-04a7a5fab937>
  - "How we organise our Design System libraries" — <https://medium.com/doctolib/how-we-organise-our-design-system-libraries-to-help-doctolib-designers-use-more-than-70-000-c15237c81f6c>
  - "The tortuous journey of enhancing our color palette" — <https://medium.com/doctolib/the-tortuous-journey-of-enhancing-our-color-palette-4616b5b9c43e>
- "Choosing form components" decision tree — <https://fountn.design/resource/doctolibs-oxygen-design-system-choosing-form-components/>
- "Choosing actions" decision tree — <https://fountn.design/resource/doctolib-design-system-choosing-actions/>

---

## 2. Principes fondateurs (et application chez nous)

### 2.1 Accessible par construction

Premier principe d'Oxygen : pour un logiciel santé, l'accessibilité n'est pas négociable. The Box est un jeu, pas un produit santé, mais nous adoptons la même posture — les problèmes d'accessibilité sont des **bugs**, pas du « polish ».

Règles concrètes :

- **Labels textuels visibles obligatoires dans les formulaires.** Même si `aria-label` satisfait techniquement WCAG, un `<Label htmlFor="…">` visible est requis pour chaque `<Input>`, `<Textarea>`, `<Select>` et groupes `<RadioGroup>`/`<Checkbox>`. Les inputs de recherche avec icône loupe et `aria-label` sont une exception **documentée** (« compromis documenté » selon Oxygen).
- **Les éléments interactifs sans texte ont besoin d'un nom accessible.** Tout `<button>` ou `<a>` dont l'unique enfant est une `<Icon />` DOIT avoir `aria-label="…"` (ou un `<span className="sr-only">` masqué visuellement).
- **Pas de signal d'état par la couleur seule.** Erreurs, succès, avertissements doivent toujours combiner couleur + icône, label ou texte. Les couleurs de paliers de score (`text-score-*` dans `ui-tokens.md`) ne doivent pas être l'unique différenciateur sur les chips Metacritic, badges de vitesse, etc.
- **`focus-visible` obligatoire.** Si vous mettez `focus:outline-none`, vous DEVEZ le remplacer par un style `focus-visible:ring-…` (basé sur tokens, voir `--ring`). Ne jamais retirer le focus sans alternative.
- **Sémantique HTML native d'abord.** Utilisez `<button>` pour les actions, `<a href>` pour la navigation, `<nav>`, `<main>`, `<header>`, `<footer>`, `<section>` quand pertinent. `<div onClick>` est interdit sans `role`, `tabIndex` et gestionnaires clavier.
- **Ordre des titres.** Une page expose un `<h1>` et les titres descendent sans saut (pas de `h1 → h3`).
- **Images.** Toute `<img>` significative a un `alt` non vide ; les images décoratives utilisent `alt=""` (et sont généralement déjà des arrière-plans).
- **Reduced motion.** `index.css` neutralise déjà les durées d'animation sous `prefers-reduced-motion: reduce`. Ne pas ajouter de règles `!important` qui contournent ce comportement.

### 2.2 Tokens d'abord, jamais de valeurs brutes

Oxygen considère les tokens comme l'unique canal légitime pour les décisions de design. Nous l'imposons via `docs/ui-tokens.md` et la règle ESLint locale `design-tokens/no-raw-design-tokens`. Principe à retenir :

> **Un token est une décision de design. Une valeur brute est une fuite.**

Si vous tendez la main vers `#xxxxxx`, `rgba(…)`, `oklch(…)` ou un utilitaire de palette Tailwind (`bg-red-500`, `text-amber-400`, `from-green-500`), arrêtez-vous et ajoutez d'abord un token. Idem pour `style={{ marginTop: '13px' }}` inline — utilisez l'échelle d'espacement.

### 2.3 Hiérarchie d'actions

Le guide « Choosing actions » d'Oxygen impose une hiérarchie stricte :

| Niveau | Quand | Mapping The Box |
|--------|-------|-----------------|
| **Primaire** | Action la plus importante de la vue | `<Button variant="default">` (violet primary) |
| **Secondaire** | Alternatives importantes ou co-actions | `<Button variant="secondary">` ou `outline` |
| **Tertiaire** | Actions de faible priorité, dismissibles, annexes | `<Button variant="ghost">` ou `<Button variant="link">` |
| **Destructif** | Tout ce qui supprime / ne peut être annulé | `<Button variant="destructive">` |

Règles :

- **Une seule action primaire par contexte.** Une page, modale, carte ou formulaire n'a au plus qu'une CTA primaire. Si deux actions sont d'égale importance, les deux doivent être secondaires.
- **Même intention → même variante.** « Annuler » doit avoir le même rendu dans tous les dialogues. « Sauvegarder » doit avoir le même rendu dans tous les formulaires admin.
- **Le destructif est sa propre catégorie.** Ne jamais styler une action destructrice en primaire. Ne jamais la mettre sur le même axe qu'une action sûre sans séparation (règle des footers de modale : destructif à gauche, sûr à droite — ou inverse, mais constant).

### 2.4 Arbres de décision pour le choix des composants

Oxygen livre des arbres de décision plutôt que des catalogues. Les deux plus cités :

**Choix d'un composant de formulaire**

- 1 parmi N, ≤4 options, toutes visibles → **RadioGroup**
- 1 parmi N, ≥5 options ou espace limité → **Select**
- M parmi N (multi-sélection) → **groupe de Checkbox**
- Texte libre court → **Input**
- Texte libre long → **Textarea**
- Toggle booléen avec effet immédiat → **Switch**
- Toggle booléen dans un formulaire à soumettre → **Checkbox**

**Choix d'un type d'action**

- Déclenche une action sur la page courante / soumet un formulaire → **`<Button>`**
- Navigue vers une autre URL → **`<a>` / `<Link>`**
- Ressemble à un bouton mais navigue → **`<Button asChild><Link/></Button>`** (ne jamais styler une `<a>` en bouton à la main)
- Raccourci iconique sans label → interdit sans `aria-label`

En cas de doute : « est-ce une action ou une navigation ? ». Si vous ne pouvez pas répondre, vous choisissez le mauvais composant.

### 2.5 Compromis documenté

Tout design system a ses exceptions. Règle d'Oxygen : une exception documentée est une feature ; une exception non documentée est un bug.

Chez nous :

- Les composants dans `src/components/backgrounds/` ont légitimement besoin d'hex bruts (matériaux Three.js). La règle ESLint les exclut — cette exclusion est la documentation.
- Les inputs de recherche sans label visible sont autorisés quand (a) une icône loupe rend l'intention évidente, (b) `aria-label` est défini, (c) le composant est réutilisé via un pattern documenté.
- Toute autre déviation doit être justifiée dans la description de la PR.

### 2.6 Cohérence avant ingéniosité

Deux solutions également valables au même problème valent moins qu'une seule solution légèrement imparfaite mais partagée. Avant d'ajouter un composant, vérifiez qu'une primitive Radix/shadcn dans `src/components/ui/` ne couvre pas déjà le cas. Avant d'ajouter une variante, vérifiez que les variantes existantes de `Card`, `Alert`, `Button` n'expriment pas déjà l'intention.

### 2.7 Mobile-first — Dialog ou bottom sheet

The Box est jouée majoritairement au téléphone. Une modale centrée sur un écran < 768 px est un anti-pattern : elle se découpe avec le clavier virtuel, ignore les safe-area iOS, et oblige la cible tactile « fermer » à voyager loin du pouce. Règle :

> **Toute modale présentée à un joueur utilise `ResponsiveDialog` (`src/components/ui/responsive-dialog.tsx`), pas `Dialog` directement.** Sur mobile (`< 768px`), `ResponsiveDialog` rend une bottom sheet plein-écran-bas ; sur desktop, une modale centrée. L'API est identique à `Dialog` — `ResponsiveDialogContent / Header / Footer / Title / Description`.

Spécifications de la bottom sheet :

- **Hauteur** : `max-h-[85dvh]` (jamais 100 — laissez voir l'origine de la sheet derrière l'overlay).
- **Coins** : `rounded-t-2xl` en haut uniquement.
- **Drag handle** : barrette `h-1.5 w-12 bg-border/60` centrée en haut, affordance visuelle uniquement (pas de gesture handler — Radix gère la fermeture via overlay-tap et Escape).
- **Safe-area** : `pb-[max(env(safe-area-inset-bottom),1rem)]` pour ne pas écraser les actions sous la home-indicator iOS.
- **Animations** : `slide-in-from-bottom` / `slide-out-to-bottom`, soumises à `motion-safe:` pour respecter `prefers-reduced-motion`.
- **Footer** : `flex-col-reverse` sur mobile (action primaire au-dessus = à portée du pouce), `sm:flex-row sm:justify-end` sur desktop. Le composant `ResponsiveDialogFooter` applique déjà ce comportement.
- **Cible tactile « fermer »** : 44×44 minimum, déjà fourni par `ResponsiveDialogContent`.

Exceptions documentées :

- **Confirmations destructives ultra-courtes** (`DeleteConfirmDialog` admin) : restent en `Dialog` centré, car la modale doit interrompre — un slide-up depuis le bas est trop discret pour une action destructrice.
- **Sheets latérales (drawers)** : `Sheet side="right"` reste légitime quand le contenu est une *navigation* ou un *panel persistant* (header menu mobile, `GameMapsDrawer` admin), pas une décision ponctuelle. La règle « bottom sheet pour les décisions » distingue **modale de décision** vs **panneau de navigation**.
- **Admin** : non couvert par la règle (faible trafic mobile). Les dialogues admin peuvent rester en `Dialog`.

Arbre de décision rapide :

- Décision/action à valider, joueur, sur n'importe quel device → **`ResponsiveDialog`**
- Navigation ou panneau latéral persistant → **`Sheet side="right"` (ou `left`)**
- Confirmation destructive courte → **`Dialog` centré** (exception §2.5)
- Choix dans une liste avec recherche → **`ResponsiveDialog`** (sheet plein-écran mobile, dialogue desktop)

---

## 3. Principes → fichiers

| Principe | Où il est appliqué ou exprimé |
|----------|-------------------------------|
| Discipline des tokens | `docs/ui-tokens.md`, `packages/frontend/src/index.css`, `packages/frontend/eslint-local/no-raw-design-tokens.js` |
| Hiérarchie d'actions | `packages/frontend/src/components/ui/button.tsx` (`buttonVariants`) |
| Hiérarchie de cartes | `packages/frontend/src/components/ui/card.tsx` (variantes CVA) |
| Hiérarchie d'alertes | `packages/frontend/src/components/ui/alert.tsx` |
| Modales mobile-first | `packages/frontend/src/components/ui/responsive-dialog.tsx` |
| Toasts | `packages/frontend/src/components/ui/sonner.tsx`, `packages/frontend/src/lib/toast.ts` |
| Reduced motion | `packages/frontend/src/index.css` (`@media (prefers-reduced-motion: reduce)`) |
| Anneaux de focus | token `--ring`, utilitaire `focus-visible:ring-ring` |
| i18n | `packages/frontend/public/locales/{en,fr}/` |

---

## 4. Checklist d'audit

À utiliser en revue de PR ou en audit de page pour la conformité Oxygen.

**Accessibilité**

- [ ] Chaque input de formulaire a un `<Label>` visible lié via `htmlFor` / `id`
- [ ] Chaque `<button>` / `<a>` purement iconique a `aria-label` ou `<span className="sr-only">`
- [ ] Aucun `focus:outline-none` sans remplacement `focus-visible:`
- [ ] Aucun `<div onClick>` sans `role`, `tabIndex` et gestionnaire clavier
- [ ] Les titres descendent dans l'ordre ; un seul `<h1>` par page
- [ ] Toutes les `<img>` ont un `alt` (vide pour les décoratives)
- [ ] L'état n'est jamais communiqué par la couleur seule

**Tokens**

- [ ] Aucun `#hex`, `rgb()`, `rgba()`, `oklch()`, `hsl()` brut en JSX (ESLint l'attrape ; ne pas désactiver la règle)
- [ ] Aucun utilitaire de palette Tailwind (`bg-red-500`, etc.) hors couche de tokens
- [ ] Aucun `style={{ … }}` pour des espacements / couleurs qui pourraient être des classes utilitaires

**Hiérarchie d'actions**

- [ ] Au plus une CTA primaire par vue / modale / formulaire
- [ ] Labels et variantes Annuler/Sauvegarder cohérents entre dialogues
- [ ] Les actions destructrices utilisent `variant="destructive"` et sont séparées des actions sûres
- [ ] Les boutons qui naviguent utilisent `<Button asChild><Link/></Button>`, pas une `<a>` stylée

**Choix des composants**

- [ ] Les sélecteurs de formulaire suivent l'arbre de décision §2.4
- [ ] Pas de nouveau composant custom si une primitive `ui/*` suffit
- [ ] Pas de nouvelle variante si une variante CVA existante exprime déjà l'intention

**Mobile-first**

- [ ] Toute modale joueur utilise `ResponsiveDialog`, pas `Dialog` (cf. §2.7)
- [ ] Les bottom sheets respectent `max-h-[85dvh]`, drag handle, safe-area, footer `flex-col-reverse`
- [ ] Les cibles tactiles font ≥ 44×44 px (fermeture, CTA, items de liste)
- [ ] Le contenu reste accessible avec le clavier virtuel ouvert (test : focus sur un input dans la sheet)
