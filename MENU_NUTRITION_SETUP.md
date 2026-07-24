# Procédure Menu & Nutrition de Mealio

## Ce que le générateur prend désormais en compte

La génération hebdomadaire applique :

1. le régime alimentaire sélectionné ;
2. les allergènes sélectionnés ;
3. les exclusions libres ;
4. la cuisine souhaitée ;
5. le temps maximum ;
6. la difficulté ;
7. le budget hebdomadaire ;
8. l’âge, le sexe, le poids, la taille et le niveau d’activité ;
9. l’objectif : équilibre, maintien, perte de poids, prise de masse ou performance ;
10. le poids cible, lorsqu’il est renseigné.

Les filtres explicites sont stricts. Mealio ne les ignore plus silencieusement lorsqu’il manque des recettes : l’utilisateur reçoit un message lui demandant d’élargir ses critères.

Le budget est converti en budget maximum moyen par repas pour les jours restants. Les recettes sans prix connu sont exclues quand un budget est demandé, car Mealio ne peut pas garantir leur compatibilité.

## Profil utilisateur à compléter

Pour une génération personnalisée, renseigner dans Menu → Mon profil nutritionnel :

- âge ;
- sexe utilisé par la formule énergétique ;
- poids actuel ;
- taille ;
- niveau d’activité ;
- objectif ;
- poids cible pour une perte ou une prise de poids ;
- régime alimentaire.

Les objectifs perte de poids, prise de masse et performance sont bloqués tant que les données indispensables sont absentes.

Le calcul énergétique automatisé est réservé aux adultes. Pour un mineur, une grossesse, un allaitement, une pathologie, des troubles alimentaires ou un suivi médical, Mealio ne doit pas générer de cible calorique : demander l’avis d’un professionnel de santé.

## Méthode énergétique

Mealio utilise l’équation prédictive de Mifflin–St Jeor pour estimer le métabolisme de repos, puis un facteur d’activité.

- perte de poids : cible modérée à environ −15 % de la maintenance estimée ;
- prise de masse : environ +10 % ;
- performance : environ +5 % ;
- la cible ne descend jamais sous le métabolisme de repos estimé.

Le champ « Kcal/sem » représente une dépense sportive hebdomadaire. Il est maintenant divisé par sept avant d’être intégré à la moyenne quotidienne. Ne pas y saisir une valeur quotidienne.

Ces valeurs sont des estimations et non une prescription médicale.

## Valeurs nutritionnelles des recettes

Mealio distingue trois niveaux :

- `high` : données calculées à partir d’une table vérifiée avec quantités complètes ;
- `medium` : données fournies par la source de recette ;
- `low` : valeurs agrégées, incomplètes ou produites sans provenance vérifiable.

L’interface affiche « valeurs estimées » tant que la provenance n’est pas vérifiée.

La petite base intégrée dans `index.html` est uniquement un secours indicatif. Elle ne doit pas être présentée comme une copie complète de Ciqual.

## Intégrer officiellement Ciqual 2025

Pour disposer de valeurs de référence françaises :

1. Télécharger la table ANSES-Ciqual 2025 depuis `https://ciqual.anses.fr`.
2. Conserver la version et la date d’import dans les métadonnées.
3. Convertir les données en JSON ou en collection Firestore avec au minimum :
   - identifiant Ciqual ;
   - nom français ;
   - synonymes ;
   - énergie en kcal/100 g ;
   - protéines, glucides, lipides, fibres et sel pour 100 g ;
   - état cru/cuit ;
   - source et version.
4. Ne jamais remplacer une valeur manquante par zéro.
5. Créer une table de correspondance des unités :
   - g et kg ;
   - ml, cl et litre avec densité lorsque nécessaire ;
   - cuillère, tasse et unité avec poids moyen spécifique à l’aliment.
6. Associer chaque ingrédient à un identifiant Ciqual plutôt qu’à une recherche textuelle approximative.
7. Calculer la recette complète, puis diviser par le nombre réel de portions.
8. Enregistrer avec le résultat :
   - pourcentage d’ingrédients reconnus ;
   - pourcentage de quantités connues ;
   - version Ciqual ;
   - niveau de confiance.
9. Afficher la provenance dans la fiche recette.

La réutilisation doit respecter la Licence Ouverte et citer « ANSES-Ciqual 2025 ».

## Vérification obligatoire du fournisseur de recettes

Les données Jow transitent par `api/jow.py`. Avant une mise en production commerciale :

1. confirmer contractuellement le droit de réutiliser recettes, photos, prix et nutrition ;
2. vérifier si les nutriments sont exprimés par portion, par recette ou pour 100 g ;
3. vérifier que les prix correspondent bien à une portion ;
4. contrôler manuellement au moins 50 recettes représentatives ;
5. refuser les valeurs négatives, nulles incohérentes ou dépassant des seuils manifestement impossibles ;
6. conserver le fournisseur et la date de récupération dans chaque recette.

## Tests fonctionnels à effectuer

Créer au minimum les scénarios suivants :

- vegan + allergène lactose ;
- sans gluten + exclusion « farine » ;
- keto avec recettes dépassant 20 g de glucides ;
- budget très faible ;
- temps maximum de 20 minutes ;
- difficulté facile ;
- perte de poids avec profil complet ;
- perte de poids avec profil incomplet ;
- recette avec `25 cl` pour vérifier la conversion en 250 ml ;
- recette sans quantité pour vérifier qu’elle n’est pas inventée à 100 g ;
- semaine ne contenant que déjeuner et dîner, pour vérifier que l’écran ne prétend pas mesurer l’alimentation réellement consommée.

## Limites à communiquer

- Mealio analyse un menu planifié, pas la consommation réelle.
- Les quantités, marques, modes de cuisson et portions font varier les résultats.
- Le filtrage allergène par mots-clés est une aide, jamais une garantie médicale.
- IMC, calories et macronutriments sont des indicateurs généraux.
- Toute fonctionnalité de perte de poids doit rester informative et éviter les promesses de résultat.
