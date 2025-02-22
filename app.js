const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const app = express();

// Carregar vagas
let vagas = [];
try {
    const data = JSON.parse(fs.readFileSync('./vagas.json', 'utf-8'));
    // Garantir que 'vagas' seja um array
    vagas = Array.isArray(data.vagas) ? data.vagas : [];
} catch (err) {
    console.error('Erro ao carregar vagas.json:', err);
    vagas = [];  // Se ocorrer erro, inicializa como array vazio
}

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuração de views
app.set('view engine', 'ejs');

// Rota principal para visualizar as vagas
app.get('/', (req, res) => {
    res.render('index', { vagas });
});

// Rota para adicionar uma vaga
app.post('/add-vaga', (req, res) => {
    const { titulo, descricao } = req.body;
    const novaVaga = {
        id: vagas.length + 1,  // Atribui o ID baseado no tamanho do array
        titulo,
        descricao
    };

    vagas.push(novaVaga);
    const data = { vagas };
    fs.writeFileSync('./vagas.json', JSON.stringify(data, null, 2));

    res.redirect('/');
});

// Rota para editar uma vaga
app.post('/edit-vaga', (req, res) => {
    const { id, titulo, descricao } = req.body;
    let vaga = vagas.find(v => v.id == id);
    if (vaga) {
        vaga.titulo = titulo;
        vaga.descricao = descricao;
        const data = { vagas };
        fs.writeFileSync('./vagas.json', JSON.stringify(data, null, 2));
    }
    res.redirect('/');
});

// Rota para remover uma vaga
app.post('/remove-vaga', (req, res) => {
    const { id } = req.body;
    vagas = vagas.filter(v => v.id != id);
    const data = { vagas };
    fs.writeFileSync('./vagas.json', JSON.stringify(data, null, 2));
    res.redirect('/');
});

// Rota para editar as cidades (se necessário)
app.post('/update-cidades', (req, res) => {
    const { cidades } = req.body;
    fs.writeFileSync('./cidades.json', JSON.stringify(cidades, null, 2));
    res.redirect('/');
});

// Iniciar servidor
app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000');
});
