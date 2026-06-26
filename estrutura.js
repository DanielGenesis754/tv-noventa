// ==========================
// CONFIGURAÇÃO
// ==========================

const ARQUIVOS_JSON = {
    propagandas: "linksPropagandas.json",
    desenhos: "linksDesenhos.json",
    filmes: "linksFilmes.json"
};

let propagandasVideos = [];
let desenhosVideos = [];
let filmesVideos = [];

let isPlaybackOn = false;

let playlistAtual = [];
let indicePlaylist = 0;

// ==========================
// CARREGAMENTO DOS JSON
// ==========================

async function carregarJson(caminho) {

    try {

        const resposta = await fetch(caminho);

        if (!resposta.ok) {
            throw new Error(`Erro ao carregar ${caminho}`);
        }

        return await resposta.json();

    } catch (erro) {

        console.error(erro);

        return {
            videos: []
        };
    }
}

async function carregarBiblioteca() {

    const propagandas = await carregarJson(
        ARQUIVOS_JSON.propagandas
    );

    const desenhos = await carregarJson(
        ARQUIVOS_JSON.desenhos
    );

    const filmes = await carregarJson(
        ARQUIVOS_JSON.filmes
    );

    propagandasVideos = propagandas.videos || [];
    desenhosVideos = desenhos.videos || [];
    filmesVideos = filmes.videos || [];

    updatePlaybackButtonVisibility();
}

// ==========================
// SHUFFLE
// ==========================

function embaralhar(array) {

    const copia = [...array];

    for (let i = copia.length - 1; i > 0; i--) {

        const j = Math.floor(
            Math.random() * (i + 1)
        );

        [copia[i], copia[j]] =
        [copia[j], copia[i]];
    }

    return copia;
}

// ==========================
// PLAYLIST
// ==========================

function gerarPlaylist() {

    let videos = [];

    if (
        document.getElementById(
            "programasCheckbox"
        ).checked
    ) {
        videos.push(...propagandasVideos);
    }

    if (
        document.getElementById(
            "desenhosCheckbox"
        ).checked
    ) {
        videos.push(...desenhosVideos);
    }

    if (
        document.getElementById(
            "filmesCheckbox"
        ).checked
    ) {
        videos.push(...filmesVideos);
    }

    playlistAtual = embaralhar(videos);

    indicePlaylist = 0;
}

function obterProximoVideo() {

    if (playlistAtual.length === 0) {
        return null;
    }

    if (indicePlaylist >= playlistAtual.length) {

        playlistAtual =
            embaralhar(playlistAtual);

        indicePlaylist = 0;
    }

    return playlistAtual[indicePlaylist++];
}

// ==========================
// PLAYER
// ==========================

function criarIframe(url) {

    const iframe =
        document.createElement("iframe");

    iframe.width = "100%";
    iframe.height = "100%";

    iframe.src = `${url}${
        url.includes("?") ? "&" : "?"
    }autoplay=1&rel=0&modestbranding=1`;

    iframe.title =
        "YouTube video player";

    iframe.frameBorder = "0";

    iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

    iframe.referrerPolicy =
        "strict-origin-when-cross-origin";

    iframe.allowFullscreen = true;

    return iframe;
}

// ==========================
// ESTÁTICA
// ==========================

function mostrarEstatica(callback) {

    const videoFrame =
        document.getElementById(
            "video-frame"
        );

    const staticDiv =
        document.createElement("div");

    staticDiv.classList.add("static");

    videoFrame.innerHTML = "";

    videoFrame.appendChild(staticDiv);

    setTimeout(() => {

        callback();

    }, 1000);
}

// ==========================
// REPRODUÇÃO
// ==========================

function playNextVideo() {

    const url =
        obterProximoVideo();

    if (!url) {

        console.warn(
            "Nenhum vídeo disponível."
        );

        return;
    }

    mostrarEstatica(() => {

        const videoFrame =
            document.getElementById(
                "video-frame"
            );

        videoFrame.innerHTML = "";

        const iframe =
            criarIframe(url);

        videoFrame.appendChild(
            iframe
        );
    });
}

// ==========================
// TV
// ==========================

function ligarTV() {

    gerarPlaylist();

    playNextVideo();

    document.getElementById(
        "togglePlayback"
    ).innerText =
        "Desligar TV";

    isPlaybackOn = true;
}

function desligarTV() {

    const videoFrame =
        document.getElementById(
            "video-frame"
        );

    videoFrame.innerHTML = "";

    document.getElementById(
        "togglePlayback"
    ).innerText =
        "Ligar TV";

    isPlaybackOn = false;
}

function togglePlayback() {

    if (isPlaybackOn) {
        desligarTV();
    } else {
        ligarTV();
    }
}

// ==========================
// BOTÕES
// ==========================

function updatePlaybackButtonVisibility() {

    const botao =
        document.getElementById(
            "togglePlayback"
        );

    const habilitado =
        document.getElementById(
            "programasCheckbox"
        ).checked ||
        document.getElementById(
            "desenhosCheckbox"
        ).checked ||
        document.getElementById(
            "filmesCheckbox"
        ).checked;

    botao.disabled = !habilitado;
}

// ==========================
// EVENTOS
// ==========================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await carregarBiblioteca();

        document
            .getElementById(
                "programasCheckbox"
            )
            .addEventListener(
                "change",
                updatePlaybackButtonVisibility
            );

        document
            .getElementById(
                "desenhosCheckbox"
            )
            .addEventListener(
                "change",
                updatePlaybackButtonVisibility
            );

        document
            .getElementById(
                "filmesCheckbox"
            )
            .addEventListener(
                "change",
                updatePlaybackButtonVisibility
            );

        document
            .getElementById(
                "togglePlayback"
            )
            .addEventListener(
                "click",
                togglePlayback
            );

        document
            .getElementById(
                "nextVideo"
            )
            .addEventListener(
                "click",
                () => {

                    if (
                        isPlaybackOn
                    ) {

                        playNextVideo();
                    }
                }
            );
    }
);