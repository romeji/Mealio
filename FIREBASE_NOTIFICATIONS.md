# Configuration des notifications Mealio

Le module comprend :

- un centre de notifications in-app en temps réel ;
- des préférences par utilisateur et par catégorie ;
- des heures silencieuses ;
- une file hors ligne avec renvoi automatique ;
- des notifications Web Push/PWA via Firebase Cloud Messaging ;
- une API authentifiée qui vérifie l’appartenance au foyer ;
- une déduplication des événements et le nettoyage des jetons FCM invalides.

## Variables Vercel

Configurer les variables suivantes dans le projet Vercel :

```text
FIREBASE_PROJECT_ID=smartcard-4c62c
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
FIREBASE_VAPID_PUBLIC_KEY=...
APP_ORIGIN=https://votre-domaine.fr
```

La clé VAPID publique se crée dans Firebase Console → Paramètres du projet → Cloud Messaging → Certificats Web Push. Il faut également activer l’API Firebase Cloud Messaging.

## Règles Firestore

Le navigateur lit uniquement la sous-collection de notifications de l’utilisateur connecté. Ajoutez ces règles à vos règles existantes :

```text
match /users/{uid}/notifications/{notificationId} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if false;
}

match /users/{uid}/devices/{deviceId} {
  allow read, write: if false;
}
```

Les créations, modifications et jetons sont gérés par Firebase Admin côté serveur, qui ne dépend pas des règles clientes.

## Cas d’usage branchés

- ajout d’un article à la liste ;
- démarrage des courses ;
- fin des courses et rangement dans le frigo ;
- import d’un ticket ;
- génération complète du menu ;
- planification manuelle d’une recette ;
- arrivée d’un membre dans le foyer.

Chaque événement est créé pour les autres membres seulement. Les préférences du destinataire et ses heures silencieuses sont appliquées avant l’envoi mobile.

## Test

1. Déployer les variables et les règles.
2. Ouvrir Mealio avec deux comptes appartenant au même foyer.
3. Sur le second compte, ouvrir Notifications → Réglages → Activer les notifications mobiles.
4. Fermer ou placer la PWA du second compte en arrière-plan.
5. Ajouter un article depuis le premier compte.

Le second compte doit recevoir le push et retrouver le même événement dans son centre de notifications.
