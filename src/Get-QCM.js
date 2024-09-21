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

// Interface pour saisie utilisateur dans la console
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

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

            // Vérification si la question est dans le fichier const.json
            if (!qcmResponses[questionBase64]) {
                // Récupérer les propositions de réponses
                const propositionsBase64 = response.data.data.propositions;

                if (!propositionsBase64 || propositionsBase64.length === 0) {
                    throw new Error("Erreur : Aucune proposition trouvée pour le QCM.");
                }

                const answersDecoded = propositionsBase64.map(decodeBase64);

                console.log("\nRéponses possibles :");
                answersDecoded.forEach((reponse, index) => {
                    console.log(`${index + 1}. ${reponse}`);
                });

                rl.question("\nEntrez exactement l'une des réponses proposées : ", async (input) => {
                    const selectedAnswer = answersDecoded.find(answer => answer === input);

                    if (selectedAnswer) {
                        const answerBase64 = Buffer.from(selectedAnswer, 'utf-8').toString('base64');
                        await submitQCMResponse(token, answerBase64);
                    } else {
                        console.log("Réponse invalide. Veuillez relancer le programme.");
                        rl.close();
                    }
                });
            } else {
                // Si la question est déjà connue
                const answerBase64 = qcmResponses[questionBase64];
                await submitQCMResponse(token, answerBase64);
            }
        } else {
            console.log("Connexion réussie sans QCM.");
        }
    } catch (error) {
        console.error("Erreur lors de la connexion :", error.response ? error.response.data : error.message);
    }
}

// Fonction pour soumettre la réponse au QCM
async function submitQCMResponse(token, reponseQCM) {
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
        } else {
            console.log("QCM incorrect. Veuillez réessayer.");
        }

        rl.close(); // Fermer l'interface readline après soumission
    } catch (error) {
        console.error("Erreur lors de la soumission du QCM :", error.response ? error.response.data : error.message);
    }
}

// Exécuter le script
connectToEcoleDirecte();
