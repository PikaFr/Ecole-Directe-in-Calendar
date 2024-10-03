const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Charger les informations depuis const.json
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'const.json'), 'utf-8'));

// Identifiants utilisateur pour Ecole Directe
const loginData = {
    identifiant: config.ecoleDirecte.identifiant,
    motdepasse: config.ecoleDirecte.motdepasse,
    isReLogin: false,
    uuid: ''
};

// URL des requêtes Ecole Directe
const loginUrl = 'https://api.ecoledirecte.com/v3/login.awp';
const doubleAuthGetUrl = 'https://api.ecoledirecte.com/v3/connexion/doubleauth.awp?verbe=get';
const doubleAuthPostUrl = 'https://api.ecoledirecte.com/v3/connexion/doubleauth.awp?verbe=post';
var emploiDuTempsUrl = '';

// ID du calendrier Google
const calendarId = config.googleCalendar.calendarId;

// Dictionnaire de questions/réponses en base64 pour le QCM Ecole Directe
const qcmResponses = config.qcmResponses;

// Nombre de jours à vérifier
const daysToCheck = config.settings.daysToCheck;

const TOKEN_PATH = path.join(__dirname, 'token.json');

function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Read token.js
    fs.readFile(TOKEN_PATH, 'utf-8', (err, token) => {
        if (err) {
            console.log('Token non trouvé. Exécution de GET-token.js pour obtenir un nouveau token.');
            // Exécuter GET-token.js à l'aide de __dirname
            const { exec } = require('child_process');
            const getTokenScriptPath = path.join(__dirname, 'GET-token.js'); // Chemin absolu de GET-token.js

            exec(`node ${getTokenScriptPath}`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Erreur lors de l'exécution de GET-token.js: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`Erreur stderr: ${stderr}`);
                    return;
                }
                console.log(`Sortie GET-token.js: ${stdout}`);

                // Après l'exécution de GET-token.js, relancer authorize pour réutiliser le token
                fs.readFile(TOKEN_PATH, 'utf-8', (err, token) => {
                    if (err) {
                        return console.error('Erreur lors de la lecture du token après exécution de GET-token.js:', err);
                    }
                    oAuth2Client.setCredentials(JSON.parse(token));
                    callback(oAuth2Client);
                });
            });
        } else {
            oAuth2Client.setCredentials(JSON.parse(token));
            callback(oAuth2Client);
        }
    });
}

// Fonction pour formater la date au format Google Calendar
function formatDateToGoogleCalendar(dateString) {
    const date = new Date(dateString.replace(' ', 'T'));
    return date.toISOString();
}

// Fonction pour normaliser les dates et éliminer les différences de fuseau horaire
function normalizeDateForComparison(dateString) {
    const date = new Date(dateString);
    return date.toISOString();
}

async function removeObsoleteEvents(auth, knownCourseIds) {
    const calendar = google.calendar({ version: 'v3', auth });

    // Définir les dates de début et de fin pour la période à vérifier
    const startDate = getFutureDate(0);
    const endDate = getFutureDate(daysToCheck);

    try {
        const events = await calendar.events.list({
            calendarId: calendarId,
            timeMin: `${startDate}T00:00:00Z`,
            timeMax: `${endDate}T23:59:59Z`,
            singleEvents: true,
            orderBy: 'startTime',
        });

        for (const event of events.data.items) {
            // Vérifier si l'événement a un ID de cours dans sa description
            const eventDescription = event.description || '';
            const idMatch = eventDescription.match(/ID: (\d+)/);
            const eventCourseId = idMatch ? idMatch[1] : null;

            if (eventCourseId) {
                // Convertir l'ID en chaîne de caractères pour s'assurer que la comparaison est correcte
                const eventCourseIdStr = eventCourseId.toString();
                const knownCourseIdsStr = knownCourseIds.map(id => id.toString());

                // Si l'événement a un ID et qu'il ne fait pas partie des cours connus, le supprimer
                if (!knownCourseIdsStr.includes(eventCourseIdStr)) {
                    console.log(`L'événement avec l'ID ${eventCourseIdStr} n'existe plus dans Ecole Directe. Suppression de l'événement.`);
                    try {
                        await calendar.events.delete({
                            calendarId: calendarId,
                            eventId: event.id,
                        });
                        console.log(`Événement supprimé : ${event.summary}`);
                    } catch (err) {
                        console.error(`Erreur lors de la suppression de l'événement : ${event.summary}`, err);
                    }
                }
            } else {
                console.log(`L'événement "${event.summary}" n'a pas d'ID de cours. Il a peut-être été ajouté manuellement, il ne sera donc pas supprimé.`);
            }
        }
    } catch (err) {
        console.error("Erreur lors de la récupération des événements dans Google Calendar :", err);
    }
}

// Fonction pour vérifier si un cours existe déjà dans Google Calendar
async function findExistingEvent(calendar, calendarId, course) {
    const startDateTime = formatDateToGoogleCalendar(course.start_date);
    const endDateTime = formatDateToGoogleCalendar(course.end_date);

    // console.log(`Vérification des événements existants pour : ${course.matiere}`);
    // console.log(`Date de début du cours : ${startDateTime}`);
    // console.log(`Date de fin du cours : ${endDateTime}`);

    try {
        const events = await calendar.events.list({
            calendarId: calendarId,
            timeMin: startDateTime,
            timeMax: endDateTime,
            singleEvents: true,
            orderBy: 'startTime',
        });

        // console.log("Événements récupérés depuis Google Calendar :");
        // console.log(events.data.items);

        // Recherche d'un événement qui correspond au nom, aux horaires et au professeur
        return events.data.items.find(event => {
            const eventStart = normalizeDateForComparison(event.start.dateTime);
            const eventEnd = normalizeDateForComparison(event.end.dateTime);

            // Vérifie le résumé, les horaires et la description (qui contient le professeur)
            const eventProf = event.description ? event.description.includes(course.prof) : false;

            // On compare le résumé sans tenir compte de " (Annulé)"
            const eventSummary = event.summary.replace(' (Annulé)', '');

            // console.log(`Comparaison de l'événement : ${eventSummary}`);
            // console.log(`Start Google Calendar : ${eventStart} vs Start cours : ${startDateTime}`);
            // console.log(`End Google Calendar : ${eventEnd} vs End cours : ${endDateTime}`);
            // console.log(`Professeur Google Calendar : ${eventProf ? 'match' : 'no match'} vs Prof cours : ${course.prof}`);

            return eventSummary === course.matiere && eventStart === startDateTime && eventEnd === endDateTime && eventProf;
        });
    } catch (err) {
        console.error("Erreur lors de la recherche d'un événement existant :", err);
    }
}

// Fonction pour vérifier si un cours existe déjà dans Google Calendar
async function findExistingEvent(calendar, calendarId, course) {
    const startDateTime = formatDateToGoogleCalendar(course.start_date);
    const endDateTime = formatDateToGoogleCalendar(course.end_date);

    // Utiliser l'ID du cours depuis Ecole Directe pour la comparaison
    const courseId = course.id;

    try {
        const events = await calendar.events.list({
            calendarId: calendarId,
            timeMin: startDateTime,
            timeMax: endDateTime,
            singleEvents: true,
            orderBy: 'startTime',
        });

        // Recherche d'un événement qui correspond à l'ID du cours
        return events.data.items.find(event => {
            const eventDescription = event.description ? event.description.includes(`ID: ${courseId}`) : false;

            // Comparer l'ID du cours avec celui de Google Calendar
            return eventDescription;
        });
    } catch (err) {
        console.error("Erreur lors de la recherche d'un événement existant :", err);
    }
}

// Fonction pour ajouter ou mettre à jour un cours dans Google Calendar
async function addOrUpdateCourse(auth, course) {
    const calendar = google.calendar({ version: 'v3', auth });

    const startDateTime = formatDateToGoogleCalendar(course.start_date);
    const endDateTime = formatDateToGoogleCalendar(course.end_date);

    const isAnnule = course.isAnnule ? ' (Annulé)' : '';
    const eventDetails = {
        summary: `${course.matiere}${isAnnule}`,
        location: course.salle || 'Salle non définie',
        description: `Professeur : ${course.prof || 'Non défini'}\nID: ${course.id}`,
        start: {
            dateTime: startDateTime,
            timeZone: 'Europe/Paris',
        },
        end: {
            dateTime: endDateTime,
            timeZone: 'Europe/Paris',
        },
    };

    // Vérifier si l'événement existe déjà (en utilisant l'ID du cours)
    const existingEvent = await findExistingEvent(calendar, calendarId, course);

    if (existingEvent) {
        // Si l'événement existe et que le cours n'a pas été modifié, ne pas le supprimer
        if (!course.isModifie) {
            console.log(`Le cours "${course.matiere}" existe déjà et n'a pas été modifié. Aucune action nécessaire.`);
            return;
        }

        // Si le cours a été modifié, on supprime l'événement existant et on le remplace par un nouveau
        try {
            await calendar.events.delete({
                calendarId: calendarId,
                eventId: existingEvent.id,
            });
            console.log(`Événement existant supprimé : ${existingEvent.summary}`);
        } catch (err) {
            console.error("Erreur lors de la suppression de l'événement existant :", err);
        }
    } else {
        console.log(`Aucun événement existant trouvé pour : ${course.matiere}`);
    }

    // Créer un nouvel événement
    try {
        const newEvent = await calendar.events.insert({
            calendarId: calendarId,
            resource: eventDetails,
        });
        console.log('Nouvel événement créé : %s', newEvent.data.htmlLink);
    } catch (err) {
        console.error("Erreur lors de la création de l'événement :", err);
    }
}

// Fonction pour calculer la date d'aujourd'hui + X jours
function getFutureDate(daysToAdd) {
    const date = new Date();
    date.setDate(date.getDate() + daysToAdd);
    return date.toISOString().split('T')[0]; // Retourne la date au format AAAA-MM-JJ
}

// Récupérer et ajouter les cours des X prochains jours au calendrier
async function getEmploiDuTemps(auth) {
    try {
        // Requête 1 : Connexion initiale à Ecole Directe
        let response = await axios.post(
            loginUrl,
            `data=${encodeURIComponent(JSON.stringify(loginData))}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
                }
            }
        );

        // console.log("Réponse de la requête 1 (connexion) :", response.data);
        let token = response.data.token;

        if (response.data.code === 250) {
            console.log("Double authentification requise.");

            // Requête 2 : Obtenir la question QCM
            response = await axios.post(
                doubleAuthGetUrl,
                `data={}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                        'X-Token': token
                    }
                }
            );

            // console.log("Réponse de la requête 2 (QCM) :", response.data);

            const questionBase64 = response.data.data.question;
            const reponseQCM = qcmResponses[questionBase64];

            if (!reponseQCM) {
                throw new Error("Erreur : Question QCM non reconnue.");
            }

            // Requête 3 : Soumettre la réponse au QCM
            response = await axios.post(
                doubleAuthPostUrl,
                `data=${encodeURIComponent(JSON.stringify({ choix: reponseQCM }))}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                        'X-Token': token
                    }
                }
            );

            const fa = response.data.data;
            if (!fa || !fa.cn || !fa.cv) {
                throw new Error("Erreur : Échec de la validation du QCM.");
            }

            // Requête 4 : Reconnexion avec FA
            const faLoginData = {
                identifiant: config.ecoleDirecte.identifiant, // Prend les informations depuis const.json
                motdepasse: config.ecoleDirecte.motdepasse,  // Prend le mot de passe depuis const.json
                isReLogin: false,
                uuid: config.ecoleDirecte.uuid || '', // Si l'UUID est présent dans const.json, il est utilisé sinon valeur vide
                fa: [
                    {
                        cn: fa.cn,
                        cv: fa.cv
                    }
                ]
            };

            response = await axios.post(
                loginUrl,
                `data=${encodeURIComponent(JSON.stringify(faLoginData))}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
                    }
                }
            );

            token = response.data.token;
        }

        // Requête 5 : Récupérer l'emploi du temps pour la période définie dans daysToCheck
        const today = getFutureDate(0);
        const futureDate = getFutureDate(daysToCheck);
        const emploiDuTempsData = {
            token: token,
            dateDebut: today,
            dateFin: futureDate
        };

        console.log(`Récupération des cours entre ${today} et ${futureDate}`);

        // Récupérer l'ID de l'élève et vérifier son statut
        const eleve = response.data.data.accounts.find(account => account.typeCompte === 'E'); // Trouve l'élève
        const eleveId = eleve.id; // Récupère l'ID de l'élève
        const eleveStatus = eleve.typeCompte; // Récupère le type de compte (ici "E" pour élève)

        if (eleveStatus !== 'E') {
            throw new Error("Le compte de l'élève n'est pas actif.");
        }

        // Construire dynamiquement l'URL de l'emploi du temps avec l'ID de l'élève
        emploiDuTempsUrl = `https://api.ecoledirecte.com/v3/E/${eleveId}/emploidutemps.awp?verbe=get`;


        response = await axios.post(
            emploiDuTempsUrl,
            `data=${encodeURIComponent(JSON.stringify(emploiDuTempsData))}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                    'X-Token': token
                }
            }
        );

        // console.log("Réponse de la requête 5 (emploi du temps) :", response.data);

        const courses = response.data.data;
        const knownCourseIds = [];

        for (const course of courses) {
            knownCourseIds.push(course.id); // Stocker l'ID du cours pour la vérification future
            console.log(`Ajout/mise à jour du cours : ${course.matiere} avec ${course.prof} de ${course.start_date} au ${course.end_date}`);
            await addOrUpdateCourse(auth, course);
        }

        // Après avoir synchronisé les cours, supprimer les événements obsolètes
        await removeObsoleteEvents(auth, knownCourseIds);

    } catch (err) {
        console.error("Erreur lors de la récupération ou de l'ajout des cours :", err);
    }
}

// Charger les informations d'authentification et exécuter la synchronisation
fs.readFile(path.join(__dirname, 'credentials.json'), 'utf-8', (err, content) => {
    if (err) return console.log('Erreur lors du chargement des identifiants client :', err);
    authorize(JSON.parse(content), getEmploiDuTemps);
});