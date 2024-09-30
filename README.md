# Ecole-Directe-in-Calendar
---
## Synchronisation des cours Ecole Directe vers Google Calendar

Ce projet permet de synchroniser automatiquement l'emploi du temps récupéré depuis la plateforme [Ecole Directe](https://www.ecoledirecte.com) avec un calendrier Google (Google Calendar). Il utilise l'API d'Ecole Directe pour extraire les cours, gère la double authentification si nécessaire et insère ou met à jour les événements dans votre Google Calendar.

## Fonctionnalités principales

- **Connexion à Ecole Directe** : Récupère l'emploi du temps à partir de votre compte Ecole Directe.
- **Gestion de la double authentification** : Gère automatiquement les questions de vérification (QCM) si elles sont activées sur votre compte.
- **Synchronisation avec Google Calendar** : Insère ou met à jour vos cours dans un calendrier Google.
- **Configuration personnalisable** : Modifiez facilement le nombre de jours à synchroniser et d'autres paramètres via un fichier de configuration.

## Prérequis

### 1. Créer un projet Google Cloud et activer l'API Google Calendar

#### Étape 1 : Créer un projet sur Google Cloud
1. Allez sur [Google Cloud Console](https://console.cloud.google.com/).
2. Créez un nouveau projet en cliquant sur **Select a project > New Project**.
3. Nommez votre projet et cliquez sur **Create**.

#### Étape 2 : Activer l'API Google Calendar
1. Dans votre projet, allez sur la page des **APIs & Services > Dashboard**.
2. Cliquez sur **Enable APIs and Services**.
3. Recherchez "Google Calendar API" et activez-la.

#### Étape 3 : Créer des identifiants OAuth 2.0
1. Allez dans **APIs & Services > Credentials**.
2. Cliquez sur **Create Credentials** et sélectionnez **OAuth 2.0 Client IDs**.
3. Configurez un écran de consentement pour l'API, puis sélectionnez **Web Application** comme type d'application.
4. Configurez les **Authorized Redirect URIs** à `http://localhost` (vous pouvez aussi mettre `http://localhost:3000` si nécessaire).
5. Téléchargez le fichier `credentials.json`, qui contient vos identifiants OAuth 2.0, et placez-le dans le répertoire du projet.

### 2. Récupérer l'ID du calendrier Google

1. Allez sur [Google Calendar](https://calendar.google.com).
2. Sélectionnez le calendrier dans lequel vous souhaitez synchroniser vos cours.
3. Cliquez sur les trois points à droite du nom du calendrier, puis sur **Paramètres et partage**.
4. Faites défiler jusqu'à la section **Intégrer le calendrier**.
5. Copiez l'ID du calendrier qui ressemble à une adresse e-mail (par exemple, `votre_nom@gmail.com` ou une autre adresse).

### 3. Créer un compte sur Ecole Directe

Assurez-vous d'avoir un compte valide sur [Ecole Directe](https://www.ecoledirecte.com). Vous aurez besoin de votre identifiant et mot de passe pour le connecter à l'API.

### 4. Installer Node.js

- Téléchargez et installez la dernière version de [Node.js](https://nodejs.org) si ce n'est pas déjà fait.

### 5. Installer les dépendances

1. Clonez ce projet ou téléchargez-le sur votre machine locale.
2. Ouvrez un terminal dans le répertoire du projet.
3. Installez les dépendances Node.js avec la commande suivante :

   ```bash
   npm install node.js
   npm install axios
   npm install googleapis@105 @google-cloud/local-auth@2.1.0 --save
   ```

   Cela installera toutes les bibliothèques nécessaires.

## Configuration

### 1. Créer et configurer le fichier `const.json`

Dans le répertoire du projet, créez un fichier `const.json` et configurez-le avec vos informations :

```json
{
  "ecoleDirecte": {
    "identifiant": "VOTRE_IDENTIFIANT",
    "motdepasse": "VOTRE_MOTDEPASSE"
  },
  "googleCalendar": {
    "calendarId": "VOTRE_CALENDAR_ID"
  },
  "qcmResponses": {
  },
  "settings": {
    "daysToCheck": 7
  }
}
```

- **`ecoleDirecte.identifiant`** : Votre identifiant Ecole Directe.
- **`ecoleDirecte.motdepasse`** : Votre mot de passe Ecole Directe.
- **`googleCalendar.calendarId`** : L'ID du calendrier Google que vous avez récupéré plus tôt.
- **`qcmResponses`** : Associe les questions QCM à leurs réponses voir [Obtention des différentes questions QCM](#Obtention-des-différentes-questions-QCM)
- **`settings.daysToCheck`** : Le nombre de jours à synchroniser à partir de la date actuelle.

### 2. Ajouter vos identifiants OAuth 2.0

Assurez-vous que le fichier `credentials.json` obtenu lors de la création de votre projet Google Cloud est bien placé dans le répertoire du projet.

## Obtention des différentes questions QCM
Afin d'obtenir les différentes questions QCM, il vous faudra envoyer des requetes de connection à l'aide de `Get-QCM.js`.

Ce code permet d'envoyer une requête de connection à Ecole Directe et vous renvoie la question QCM , afin d'obtennir votre liste de Question:Réponse veuillez executer ces actions :
1. Exécutez la commande suivante :
   ```bash
   node Get-QCM.js
   ```
   Cela vous retournera une question ainsi que les réponses proposées.

2. Retournez le numero de réponse correct, les informations seront enregistrés dans le fichier `const.json`

Le code sera relancera tout seul en as d'erreur ou en cas de question déjà présente dans le fichier const.js, il s'arretera au bout de 10 executions sans nouvelles questions.

> [!WARNING]
> Vous devez répondre, à chaque execution de `Get-QCM.js`, à la question QCM en base64 dans la console, sous peine d'un blocage de votre compte Ecole Directe et la nécessité de devoir changer de mot de passe.

## Initialisation

Une fois le projet configuré, suivez ces étapes pour initier le script, cette étape est obligatoire pour le bon focntionnement du projet :

1. Ouvrez un terminal dans le répertoire du projet.
2. Exécutez la commande suivante :

   ```bash
   node Get-token.js
   ```

3. Lors de l'exécution, une fenêtre de navigateur s'ouvrira pour vous demander d'autoriser l'application à accéder à votre compte Google. Connectez-vous avec le compte Google lié à votre calendrier.
4. Un fichier `token.json` sera crée dans votre dossier.

## Exécution

Une fois le projet initialisée, suivez ces étapes pour exécuter le script :

1. Ouvrez un terminal dans le répertoire du projet.
2. Exécutez la commande suivante :

   ```bash
   node main.js
   ```

3. Si votre code est bien configuré, votre emplois du temps devrait être importé dans votre Google Calendar pour les jours spécifiées dans `const.json`.

> [!WARNING]
> Le code doit être lancé depuis dossier `/src`, sinon des erreurs vous indiqueront que le code ne trouve pas les fichiers tels que `const.json`

## Personnalisation

- **Modifier le nombre de jours** : Pour changer le nombre de jours à synchroniser (par exemple, 7 jours, 14 jours, etc.), modifiez simplement la valeur de `daysToCheck` dans le fichier `const.json`.
- **Réponses au QCM** : Si votre compte Ecole Directe utilise la double authentification avec des questions QCM, ajoutez les paires question-réponse en base64 dans la section `qcmResponses` du fichier `const.json`.

## En cours de développement / de résolution
- Possible confusion des cours qui ont le même nom et les mêmes horaires
- Otpimisation du système de mise à jours des infirmation des cours

## Problèmes Résolus
- Erreur de chemin des fichier `token.json`, `const.json` et `credentials.json`
- Erreur d'execution du code à cause d'un mauvais URL API
- Création d'un fichier `Get-QCM.js` plus simple à utiliser

## Résolution des problèmes

- **Erreur de connexion** : Assurez-vous que vos identifiants Ecole Directe sont corrects et que vous n'avez pas de problème de connexion sur le site lui-même.
- **Double authentification** : Si la question QCM change, vous devrez ajouter la nouvelle question encodée en base64 avec sa réponse dans `const.json`.
- Si d'autre problèmes surviennent, n'hésitez pas à créer une Issue ou à me faire remonter le problème par Disocrd `pika_fr`.

---
> [!NOTE]
> Merci à @mrkm-dev pour sa documentation détaillée de l'API Ecole Directe sans laquelle ce petit projet n'aurai pas pu voir le jour
---

En suivant cette documentation, vous devriez être en mesure de synchroniser efficacement votre emploi du temps d'Ecole Directe avec votre Google Calendar.
