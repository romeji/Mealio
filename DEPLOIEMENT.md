# Déployer Mealio en production

## 1. Préparer Firebase

1. Créer ou ouvrir le projet Firebase.
2. Activer **Authentication** et les méthodes de connexion utilisées.
3. Ajouter le domaine Vercel dans **Authentication > Settings > Authorized domains**.
4. Créer Firestore en région européenne.
5. Activer **Cloud Messaging**, générer une clé Web Push VAPID et vérifier que l’API
   Firebase Cloud Messaging est activée.
6. Créer un compte de service pour les fonctions serveur. Ne jamais placer sa clé
   privée dans `index.html`, Git ou le service worker.

Collections utilisées :

- `users/{uid}` : profil et préférences ;
- `households/{householdId}` : liste, frigo, menu et membres ;
- `recipes/{recipeId}` : base partagée et dédupliquée de recettes ;
- `users/{uid}/notifications/{notificationId}` : centre de notifications ;
- `users/{uid}/devices/{tokenHash}` : appareils FCM.

Les règles prêtes à déployer se trouvent dans `firestore.rules`. La jonction à un
foyer passe par la route authentifiée `/api/household-join`, afin de ne jamais ouvrir
la lecture des foyers aux non-membres.

```powershell
npm install -g firebase-tools
firebase login
firebase use votre-project-id
firebase deploy --only firestore:rules
```

Testez également ces règles dans l’émulateur avant production.

## 2. Configurer Vercel

1. Installer Node.js 20+, puis `npm install`.
2. Copier `.env.example` en `.env.local` pour le développement.
3. Dans **Vercel > Project > Settings > Environment Variables**, ajouter les mêmes
   variables pour Production, Preview et Development selon le besoin.
4. Définir `APP_ORIGIN` avec l’origine HTTPS exacte de production, sans slash final.
5. Donner à `OFF_USER_AGENT` une vraie adresse de contact.
6. Lancer `npm test`, puis `vercel dev`.

La route `/api/product` sert de proxy Open Food Facts : elle ajoute l’identification
requise, utilise l’API v3 et met les réponses produit en cache. Les clés IA et
Firebase Admin restent côté serveur.

## 3. Recettes Jow et mode hors ligne

Chaque recette chargée est :

1. normalisée avec un identifiant stable `jow_<id>` ;
2. placée dans le cache mémoire ;
3. sauvegardée dans IndexedDB (`frigoly_offline/recipes`) avec version et date ;
4. enregistrée par lot dans `recipes/{id}` dans Firestore quand l’utilisateur est
   connecté.

Au prochain démarrage, IndexedDB hydrate la base avant l’affichage. Si Internet ou
Jow est indisponible, la recherche frigo et la génération de menu utilisent donc les
recettes déjà présentes sur l’appareil. Le cache historique `jow_local_db` est migré
automatiquement vers IndexedDB.

Le module **À cuisiner aujourd’hui** utilise les produits de saison en France
métropolitaine, les préférences alimentaires, le contenu du frigo et, lorsqu’ils sont
fournis par Jow, les champs `likes` et `aggregateRating`. Ces deux champs sont des
indices de popularité et non une garantie de classement officiel. La sélection reste
stable pendant la journée et le bouton ↻ permet d’obtenir une autre rotation.

Important : vérifiez les conditions d’utilisation et les droits de réutilisation,
notamment pour les textes et photos Jow, avant de constituer ou redistribuer une base
commerciale. Conservez toujours `source`, l’identifiant fournisseur et la date.

## 4. Tester les notifications

Sur deux comptes membres du même foyer :

1. installer la PWA sur deux appareils physiques ;
2. accepter les notifications sur les deux ;
3. ajouter un article, valider une course, importer un ticket et modifier un menu ;
4. vérifier le centre in-app, la notification en arrière-plan et le clic qui rouvre
   la bonne vue ;
5. tester le retrait d’un appareil et le nettoyage d’un token FCM expiré.

Sur iPhone/iPad, installer d’abord la PWA sur l’écran d’accueil puis demander la
permission depuis une action utilisateur. HTTPS est obligatoire hors `localhost`.
Voir aussi `FIREBASE_NOTIFICATIONS.md`.

## 5. Recette de validation avant mise en ligne

```powershell
npm install
npm test
node --check scan.js
node --check liste.js
node --check notifications.js
node --check service-worker.js
vercel dev
```

Vérifier manuellement :

- scan frigo avec photo nette, sombre et ambiguë ;
- fusion de « tomates », « tomate fraîche » et variantes ;
- ticket avec remise, poids, quantité et lignes non alimentaires ;
- EAN valide, invalide et produit absent ;
- recettes hors ligne après un premier chargement connecté ;
- filtres alimentaires, allergènes et objectif du profil ;
- installation PWA et mise à jour du service worker.

## 6. Publication

1. `vercel --prod`
2. Refaire le test à deux appareils sur l’URL finale.
3. Contrôler les logs des routes `product`, `jow`, `notifications` et Vision.
4. Mettre en place des alertes sur les erreurs 5xx, le taux d’échec OCR/vision et les
   tokens FCM invalides.

Pour Stripe, déclarer dans le Dashboard un webhook vers
`https://votre-domaine/api/stripe-webhook`, écouter au minimum
`checkout.session.completed`, `payment_intent.succeeded` et
`customer.subscription.deleted`, puis copier son secret de signature dans
`STRIPE_WEBHOOK_SECRET`. La route refuse les signatures invalides ou vieilles de
plus de cinq minutes et utilise Firebase Admin pour modifier le statut Premium.

Ne publiez pas tant que les règles Firestore, les droits sur les recettes et la
politique de confidentialité (photos, tickets, nutrition, notifications) n’ont pas
été validés.
