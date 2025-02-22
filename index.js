require('dotenv').config();
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Trello = require('trello');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const vagas = require('./vagas.json');

const apiKey = process.env.TRELLO_API_KEY;
const token = process.env.TRELLO_TOKEN;
const listId = process.env.TRELLO_LIST_ID;

if (!apiKey || !token || !listId) {
    console.error('Erro: As credenciais do Trello não foram fornecidas.');
    process.exit(1);
}

const trello = new Trello(apiKey, token);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false, 
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let stage = {};
let selectedVaga = {};
let candidatoNome = {};
let adminPhoneNumber = null;
let timeoutTimers = {};
let tentativaConfirmacao = {};

client.on('qr', (qr) => {
    console.log('Gerando QR code...');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp conectado!');
    const me = client.info;
    adminPhoneNumber = me.wid._serialized;
    console.log('Número do administrador capturado:', adminPhoneNumber);
});

client.on('message', async msg => {
    const chatId = msg.from;
    const mensagem = msg.body.toLowerCase();

    if (chatId === adminPhoneNumber || chatId.includes('@g.us')) {
        return;
    }

    if (timeoutTimers[chatId] && Date.now() - timeoutTimers[chatId] < 30 * 60 * 1000) {
        return;
    }

    if (!stage[chatId]) {
        await msg.reply(`Olá! Bem-vindo ao RH da empresa!\nEscolha uma opção:\n1. Já estou no processo seletivo\n2. Quero me candidatar a uma vaga`);
        stage[chatId] = 'menu_inicial';
        return;
    }

    if (stage[chatId] === 'menu_inicial') {
        if (mensagem === '1') {
            await msg.reply('Que bom te ver de volta! Logo alguém do RH entrará em contato com você.');
            delete stage[chatId];
            setTimeout(() => { delete stage[chatId]; }, 30 * 60 * 1000);
        } else if (mensagem === '2') {
            await msg.reply('Qual o seu nome?');
            stage[chatId] = 'perguntar_nome';
        } else {
            await msg.reply('Opção inválida. Escolha 1 ou 2.');
        }
        return;
    }

    if (stage[chatId] === 'perguntar_nome') {
        candidatoNome[chatId] = msg.body;
        const vagasDisponiveis = vagas.vagas;

        if (vagasDisponiveis.length === 0) {
            await msg.reply('Não temos vagas disponíveis no momento. Tente novamente mais tarde.');
            delete stage[chatId];
            return;
        }

        let vagasMsg = 'Essas são as vagas disponíveis:\n';
        vagasDisponiveis.forEach(v => {
            vagasMsg += `${v.id}. ${v.titulo}\n`;
        });
        await msg.reply(vagasMsg + 'Escolha o número da vaga que deseja se candidatar.');
        stage[chatId] = 'selecionar_vaga';
        return;
    }

    if (stage[chatId] === 'selecionar_vaga') {
        const vagaEscolhida = vagas.vagas.find(v => v.id === mensagem);
        if (vagaEscolhida) {
            selectedVaga[chatId] = vagaEscolhida;
            tentativaConfirmacao[chatId] = 0;
            await msg.reply(`Descrição da vaga *${vagaEscolhida.titulo}*:\n${vagaEscolhida.descricao}\n\nDeseja participar dessa vaga? (Sim/Não)`);
            stage[chatId] = 'confirmar_participacao';
        } else {
            await msg.reply('Vaga não encontrada. Envie o número correto.');
        }
        return;
    }

    if (stage[chatId] === 'confirmar_participacao') {
        if (mensagem === 'sim') {
            await msg.reply('Envie seu currículo (PDF ou imagem) para continuar.');
            stage[chatId] = 'enviar_curriculo';
        } else if (mensagem === 'não' || mensagem === 'nao') {
            await msg.reply('Ok! Se precisar, estamos à disposição.');
            delete stage[chatId];
        } else {
            tentativaConfirmacao[chatId] = (tentativaConfirmacao[chatId] || 0) + 1;
            if (tentativaConfirmacao[chatId] >= 3) {
                await msg.reply('Você excedeu o número de tentativas. Iniciando o processo novamente.');
                delete stage[chatId];
                delete tentativaConfirmacao[chatId];
            } else {
                await msg.reply('Resposta inválida. Por favor, responda com Sim ou Não.');
            }
        }
        return;
    }

    if (stage[chatId] === 'enviar_curriculo' && msg.hasMedia) {
        const media = await msg.downloadMedia();
        const candidato = candidatoNome[chatId] || msg._data.notifyName || 'Candidato Anônimo';
        const vaga = selectedVaga[chatId];

        const cardName = `${candidato} - ${vaga.titulo}`;
        const cardDesc = `Candidato para a vaga: ${vaga.titulo}`;

        try {
            const card = await trello.addCard(cardName, cardDesc, listId);
            const fileName = `${candidato}_${vaga.titulo}.${media.mimetype.split('/')[1]}`;
            const filePath = path.join(__dirname, 'Curriculos', fileName);

            fs.writeFileSync(filePath, media.data, { encoding: 'base64' });

            const form = new FormData();
            form.append('file', fs.createReadStream(filePath));

            await axios.post(`https://api.trello.com/1/cards/${card.id}/attachments?key=${apiKey}&token=${token}`, form, {
                headers: {
                    ...form.getHeaders()
                }
            });

            await msg.reply('Currículo recebido! Seu processo seletivo foi iniciado.');
        } catch (e) {
            console.error('Erro no upload do currículo:', e);
            await msg.reply('Erro ao processar seu currículo. Tente novamente mais tarde.');
        }

        delete stage[chatId];
        delete selectedVaga[chatId];
        delete candidatoNome[chatId];
    }
});

client.initialize();
