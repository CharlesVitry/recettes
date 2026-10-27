# Recettes

Site statique pour parcourir des recettes, en sélectionner, les partager par
lien et les exporter en PDF.

**En ligne :** https://charlesvitry.github.io/recettes/

## Fonctionnalités

- **Parcourir** les recettes : photo, durée, ingrédients, étapes et valeurs
  nutritionnelles (pour 100 g).
- **Rechercher** par nom de plat ou par ingrédient.
- **Filtrer par durée** avec le curseur « Durée max ».
- **Sélectionner** des recettes avec les cases à cocher, puis **copier le
  lien** qui n'affiche que celles-là.
- **Exporter en PDF** une recette (bouton sous la fiche) ou toute la
  sélection : une page A4 par recette, via la fenêtre d'impression du
  navigateur → « Enregistrer au format PDF ».

## Liens de partage

| Adresse | Affiche |
|---|---|
| `…/recettes/` | toutes les recettes |
| `…/recettes/?recette=22046` | une seule recette |
| `…/recettes/?recettes=22046,22114` | plusieurs recettes |

Le numéro d'une recette apparaît dans le lien créé par la sélection.

## Fonctionnement

- 100 % statique, hébergé sur GitHub Pages : pas de serveur, pas de base de
  données, pas de compte.
- Tout se passe dans le navigateur, y compris la création des PDF. Rien n'est
  envoyé ni stocké en ligne.
- Le site n'est pas référencé par les moteurs de recherche (`noindex`), mais
  reste accessible à toute personne qui a l'adresse.

## Contenu du dépôt

| Fichier | Rôle |
|---|---|
| `index.html` | la page |
| `app.js` | grille, recherche, filtre, sélection, partage |
| `style.css` | mise en forme |
| `modeles.js`, `modeles.css` | mise en page des PDF |
| `recettes.js` | les données des recettes |
| `images/` | les photos |

Ces fichiers sont générés automatiquement : les modifier ici sera écrasé à la
prochaine mise à jour.
