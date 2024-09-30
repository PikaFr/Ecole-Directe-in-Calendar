const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Charger le fichier const.json
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'const.json'), 'utf-8'));

// Extraire les informations d'authentification et de configuration
const { ecoleDirecte, qcmResponses } = config;

// URL des requêtes
const loginUrl = 'https://api.ecoledirecte.com/v3/login.awp';
const doubleAuthGetUrl = 'https://api.ecoledirecte.com/v3/connexion/doubleauth.awp?verbe=get';
const doubleAuthPostUrl = 'https://api.ecoledirecte.com/v3/connexion/doubleauth.awp?verbe=post';

// Fonction pour décoder une chaîne base64
function decodeBase64(base64String) {
    return Buffer.from(base64String, 'base64').toString('utf-8');
}

// Fonction pour créer un nouvel objet readline à chaque redémarrage
function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

let rl = createReadlineInterface(); // Initialisation de readline
let successfulAttempts = 0; // Compteur d'exécutions réussies sans nouvelle question

// Fonction pour redémarrer le script
function restartScript() {
    if (successfulAttempts >= 10) {
        console.log("\n10 exécutions consécutives réussies sans nouvelle question. Le programme s'arrête.");
        process.exit(0); // Arrêter le programme
    }

    console.log("\nRedémarrage du programme...\n");
    rl.close(); // Fermer l'ancienne instance de readline
    rl = createReadlineInterface(); // Créer une nouvelle instance
    connectToEcoleDirecte(); // Relancer le programme
}

async function connectToEcoleDirecte() {
    try {
        // Requête 1 : Connexion initiale à École Directe
        let response = await axios.post(
            loginUrl,
            `data=${encodeURIComponent(JSON.stringify({
                identifiant: ecoleDirecte.identifiant,
                motdepasse: ecoleDirecte.motdepasse,
                isReLogin: false,
                uuid: ''
            }))}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
                }
            }
        );

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

            const questionBase64 = response.data.data.question;
            if (!questionBase64) {
                throw new Error("Erreur : Aucune question trouvée dans la réponse.");
            }

            const questionDecoded = decodeBase64(questionBase64);
            console.log(`Question : ${questionDecoded}`);

            // Si la question est dans const.json, répondre automatiquement
            if (qcmResponses[questionBase64]) {
                const answerBase64 = qcmResponses[questionBase64];
                console.log("Réponse trouvée dans const.json, soumission automatique...");
                await submitQCMResponse(token, answerBase64, questionBase64, answerBase64, true);
            } else {
                // Si la question n'est pas dans const.json, demander à l'utilisateur
                successfulAttempts = 0; // Réinitialiser le compteur car il y a une nouvelle question
                const propositionsBase64 = response.data.data.propositions;

                if (!propositionsBase64 || propositionsBase64.length === 0) {
                    throw new Error("Erreur : Aucune proposition trouvée pour le QCM.");
                }

                const answersDecoded = propositionsBase64.map(decodeBase64);

                console.log("\nRéponses possibles :");
                answersDecoded.forEach((reponse, index) => {
                    console.log(`${index + 1}. ${reponse}`);
                });

                rl.question("\nEntrez le numéro de la réponse correcte : ", async (input) => {
                    const selectedIndex = parseInt(input) - 1;
                    const selectedAnswer = answersDecoded[selectedIndex];

                    if (selectedAnswer) {
                        const answerBase64 = Buffer.from(selectedAnswer, 'utf-8').toString('base64');
                        await submitQCMResponse(token, answerBase64, questionBase64, answerBase64, false);
                    } else {
                        console.log("Numéro de réponse invalide. Relance du programme.");
                        restartScript();
                    }
                });
            }
        } else {
            console.log("Connexion réussie sans QCM.");
            successfulAttempts++; // Incrémenter le compteur si pas de nouvelle question
            restartScript(); // Relancer le script automatiquement
        }
    } catch (error) {
        console.error("Erreur lors de la connexion :", error.response ? error.response.data : error.message);
        rl.close();
    }
}

// Fonction pour soumettre la réponse au QCM
async function submitQCMResponse(token, reponseQCM, questionBase64, answerBase64, autoResponse) {
    try {
        let response = await axios.post(
            doubleAuthPostUrl,
            `data=${encodeURIComponent(JSON.stringify({ choix: reponseQCM }))}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                    'X-Token': token
                }
            }
        );

        if (response.data.code === 200) {
            console.log("QCM correct. Connexion réussie.");

            // Si la réponse n'était pas automatique et n'est pas déjà dans const.json, on enregistre la question et la réponse
            if (!autoResponse) {
                config.qcmResponses[questionBase64] = answerBase64;
                fs.writeFileSync(path.join(__dirname, 'const.json'), JSON.stringify(config, null, 4), 'utf-8');
                console.log("Question et réponse enregistrées dans const.json.");
            }

            successfulAttempts++; // Incrémenter le compteur car pas de nouvelle question
            restartScript(); // Relancer après validation
        } else {
            console.log("QCM incorrect. Relance du programme...");
            successfulAttempts = 0; // Réinitialiser le compteur si la réponse est incorrecte
            restartScript(); // Relancer le script en cas de réponse incorrecte
        }
    } catch (error) {
        console.error("Erreur lors de la soumission du QCM :", error.response ? error.response.data : error.message);
        successfulAttempts = 0; // Réinitialiser le compteur en cas d'erreur
        restartScript(); // Relancer en cas d'erreur
    }
}

// Exécuter le script
connectToEcoleDirecte();
