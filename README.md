# Mealio 🥬

Mealio est une PWA de courses intelligente : liste partagée, gestion du frigo, historique des courses et tickets, scan de codes-barres, recherche de recettes et menus de la semaine.

## Architecture

- `index.html` : interface et logique principale
- `liste.js` : liste de courses
- `scan.js` : tickets et codes-barres
- `ingredients.js` : base d’autocomplétion
- `service-worker.js` et `manifest.webmanifest` : installation et mode hors ligne
- `api/` : fonctions serveur pour l’IA, les recettes et Stripe

## Lancer le projet

```bash
npm install
npm start
```

Le script `start` utilise `vercel dev`, nécessaire pour exécuter aussi les routes sous `/api`.

## Déploiement

Vercel est la cible recommandée, car l’application utilise des fonctions serveur. Un déploiement GitHub Pages ne publie que la partie statique : les fonctions d’IA et les autres routes `/api` n’y seront pas disponibles.

Les secrets des fournisseurs d’IA et de Stripe doivent être configurés en variables d’environnement Vercel. Ils ne doivent jamais être ajoutés au code client.

## Firebase

La configuration cliente se trouve dans `index.html`. Le domaine de production doit être ajouté dans Firebase Console → Authentication → Settings → Authorized domains.

Les règles Firestore doivent limiter chaque utilisateur à ses données et vérifier l’appartenance au foyer pour toute lecture ou écriture partagée. Ne déployez pas de règle qui autorise tous les utilisateurs connectés à modifier tous les foyers.

## PWA

L’application dispose d’un manifeste et d’un service worker. Sur un navigateur compatible, elle peut être installée depuis l’action « Installer l’application » ou « Ajouter à l’écran d’accueil ».

## Notifications

Le module de notifications foyer se trouve dans `notifications.js` et son API dans `api/notifications.js`. La configuration Firebase Cloud Messaging, les variables Vercel et les règles Firestore nécessaires sont décrites dans `FIREBASE_NOTIFICATIONS.md`.

## Menu et nutrition

Le fonctionnement des filtres, les limites des estimations nutritionnelles et la procédure d’intégration de la table officielle ANSES-Ciqual sont détaillés dans `MENU_NUTRITION_SETUP.md`.
