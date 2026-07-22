const videoSources = {
    programas: 'linksPropagandas.json', // Lista de vídeos desta categoria.
    desenhos: 'linksDesenhos.json',
    filmes: 'linksFilmes.json',
    intervalosGlobo: 'linksIntervalosGlobo.json',
    jornais: 'linksJornais.json',
    entrevistas: 'linksEntrevista.json',
    humor: 'linksHumor.json'
};

const videoLists = {
    programas: [],
    desenhos: [],
    filmes: [],
    intervalosGlobo: [],
    jornais: [],
    entrevistas: [],
    humor: []
};

// Centraliza a relação entre categoria, lista carregada e checkbox da interface.
const categories = [
    { key: 'programas', checkboxId: 'programasCheckbox' },
    { key: 'desenhos', checkboxId: 'desenhosCheckbox' },
    { key: 'filmes', checkboxId: 'filmesCheckbox' },
    { key: 'intervalosGlobo', checkboxId: 'intervalosGloboCheckbox' },
    { key: 'jornais', checkboxId: 'jornaisCheckbox' },
    { key: 'entrevistas', checkboxId: 'entrevistasCheckbox' },
    { key: 'humor', checkboxId: 'humorCheckbox' }
];

// Vídeos que o YouTube recusou carregar não entram mais na grade atual.
const unavailableVideos = new Set();

let isPlaybackOn = false;
let videosLoaded = false;
let youtubeApiPromise = null;
let currentPlayer = null;
let siteVolume = 60;
// Impede que carregamentos antigos sobrescrevam um vídeo escolhido mais recentemente.
let playbackVersion = 0;
// A grade é embaralhada uma vez e permanece estável até os filtros mudarem.
let channelPlaylist = [];
let currentChannelIndex = -1;

async function loadVideoList(source) {
    const response = await fetch(source, { cache: 'no-store' });

    if (!response.ok) {
        throw new Error(`Nao foi possivel carregar ${source}: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.videos)) {
        throw new Error(`${source} precisa ter o formato { "videos": [...] }`);
    }

    return data.videos;
}

async function loadAllVideoLists() {
    // Carrega todas as categorias em paralelo para liberar a TV apenas quando estiver pronta.
    const entries = await Promise.all(
        Object.entries(videoSources).map(async ([category, source]) => {
            const videos = await loadVideoList(source);
            return [category, videos];
        })
    );

    entries.forEach(([category, videos]) => {
        videoLists[category] = videos;
    });

    videosLoaded = true;
}

function loadYouTubeApi() {
    if (window.YT && window.YT.Player) {
        return Promise.resolve(window.YT);
    }

    if (youtubeApiPromise) {
        return youtubeApiPromise;
    }

    // Reaproveita uma única Promise: a API do YouTube só precisa ser inserida uma vez.
    youtubeApiPromise = new Promise((resolve, reject) => {
        const previousReadyCallback = window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
            if (typeof previousReadyCallback === 'function') {
                previousReadyCallback();
            }

            if (window.YT && window.YT.Player) {
                resolve(window.YT);
            } else {
                reject(new Error('A API do YouTube foi carregada sem disponibilizar o player.'));
            }
        };

        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.onerror = () => {
            youtubeApiPromise = null;
            reject(new Error('Nao foi possivel carregar a API do YouTube.'));
        };
        document.head.appendChild(script);
    });

    return youtubeApiPromise;
}

function parseYouTubeEmbedUrl(videoUrl) {
    // Aceita links de embed ou links comuns do YouTube e obtém somente o ID do vídeo.
    const url = new URL(videoUrl, window.location.href);
    const embedMatch = url.pathname.match(/\/embed\/([^/?]+)/);
    const videoId = embedMatch ? embedMatch[1] : url.searchParams.get('v');

    if (!videoId) {
        throw new Error(`Nao consegui identificar o videoId em ${videoUrl}`);
    }

    const playerVars = {
        autoplay: 1,
        controls: 0,
        cc_load_policy: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        playsinline: 1
    };

    if (url.searchParams.has('start')) {
        playerVars.start = url.searchParams.get('start');
    }

    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        playerVars.origin = window.location.origin;
    }

    return { videoId, playerVars };
}

function destroyCurrentPlayer() {
    if (currentPlayer && typeof currentPlayer.destroy === 'function') {
        currentPlayer.destroy();
    }

    currentPlayer = null;
}

function getSelectedVideos() {
    // Une apenas as listas cujas categorias estão marcadas na tela.
    return categories.flatMap(({ key, checkboxId }) => (
        document.getElementById(checkboxId).checked ? videoLists[key] : []
    ));
}

function hasSelectedCategory() {
    return categories.some(({ checkboxId }) => document.getElementById(checkboxId).checked);
}

function isCurrentPlayback(version) {
    return isPlaybackOn && version === playbackVersion;
}

// Fisher-Yates: embaralha ao montar a grade, nunca a cada troca de canal.
function shuffleVideos(videos) {
    const shuffledVideos = [...videos];

    for (let index = shuffledVideos.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [shuffledVideos[index], shuffledVideos[randomIndex]] = [shuffledVideos[randomIndex], shuffledVideos[index]];
    }

    return shuffledVideos;
}

function updateChannelDisplay() {
    // Mostra a posição atual para o usuário saber que pode voltar ao mesmo vídeo.
    const channelDisplay = document.getElementById('channelDisplay');

    if (channelPlaylist.length === 0) {
        channelDisplay.innerText = 'Sem canais';
        return;
    }

    const channelNumber = currentChannelIndex >= 0 ? currentChannelIndex + 1 : '--';
    channelDisplay.innerText = `Canal ${channelNumber} / ${channelPlaylist.length}`;
}

function rebuildChannelPlaylist() {
    // Set remove links duplicados antes de formar a sequência de canais.
    const uniqueVideos = [...new Set(getSelectedVideos())];
    channelPlaylist = shuffleVideos(uniqueVideos.filter((videoUrl) => !unavailableVideos.has(videoUrl)));
    currentChannelIndex = -1;
    updateChannelDisplay();
}

function disableYouTubeCaptions(player) {
    try {
        if (typeof player.unloadModule === 'function') {
            player.unloadModule('captions');
            player.unloadModule('cc');
        }

        if (typeof player.setOption === 'function') {
            player.setOption('captions', 'track', {});
            player.setOption('cc', 'track', {});
            player.setOption('captions', 'fontSize', 0);
        }
    } catch (error) {
        console.warn('Nao foi possivel desligar legendas automaticamente.', error);
    }
}

async function createYouTubePlayer(videoUrl, version) {
    await loadYouTubeApi();

    // Se o usuário mudou de canal enquanto a API carregava, abandona esta solicitação antiga.
    if (!isCurrentPlayback(version)) {
        return null;
    }

    const videoFrame = document.getElementById('video-frame');
    const playerHost = document.createElement('div');
    const { videoId, playerVars } = parseYouTubeEmbedUrl(videoUrl);

    playerHost.id = 'youtube-player-host';
    videoFrame.appendChild(playerHost);

    const player = new YT.Player(playerHost, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars,
        events: {
            onReady: (event) => {
                if (!isCurrentPlayback(version) || event.target !== currentPlayer) {
                    event.target.destroy();
                    return;
                }

                if (siteVolume > 0 && typeof event.target.unMute === 'function') {
                    event.target.unMute();
                }

                disableYouTubeCaptions(event.target);
                event.target.setVolume(siteVolume);
                event.target.playVideo();

                setTimeout(() => disableYouTubeCaptions(event.target), 800);
                setTimeout(() => disableYouTubeCaptions(event.target), 2000);
            },
            onStateChange: (event) => {
                if (isCurrentPlayback(version) && event.target === currentPlayer && window.YT && event.data === YT.PlayerState.PLAYING) {
                    disableYouTubeCaptions(event.target);
                }
            },
            onError: (event) => {
                if (isCurrentPlayback(version) && event.target === currentPlayer) {
                    skipUnavailableVideo(videoUrl, event.data);
                }
            }
        }
    });

    if (!isCurrentPlayback(version)) {
        player.destroy();
        return null;
    }

    currentPlayer = player;
    return player;
}

function skipUnavailableVideo(videoUrl, errorCode) {
    unavailableVideos.add(videoUrl);
    console.warn(`Video indisponivel, pulando para outro. Codigo YouTube: ${errorCode}`, videoUrl);

    // Remove o canal com erro sem reorganizar os demais vídeos da sequência.
    const unavailableIndex = channelPlaylist.indexOf(videoUrl);

    if (unavailableIndex >= 0) {
        channelPlaylist.splice(unavailableIndex, 1);

        if (currentChannelIndex >= channelPlaylist.length) {
            currentChannelIndex = 0;
        }

        updateChannelDisplay();
    }

    if (isPlaybackOn && channelPlaylist.length > 0) {
        playChannel(currentChannelIndex);
    }
}

function showStaticTransition(videoFrame) {
    const staticDiv = document.createElement('div');
    const staticVideo = document.createElement('video');

    staticDiv.classList.add('static');
    staticVideo.classList.add('static-video');
    staticVideo.src = 'TvStatic.mp4';
    staticVideo.autoplay = true;
    staticVideo.playsInline = true;
    staticVideo.loop = true;
    staticVideo.preload = 'auto';
    staticVideo.volume = siteVolume / 100;

    staticVideo.addEventListener('canplay', () => {
        staticDiv.classList.add('static-video-loaded');
    }, { once: true });

    staticVideo.addEventListener('error', () => {
        staticVideo.remove();
    }, { once: true });

    staticDiv.appendChild(staticVideo);
    videoFrame.appendChild(staticDiv);

    const playPromise = staticVideo.play();

    if (playPromise) {
        playPromise.catch(() => {
            staticVideo.muted = true;
            staticVideo.play().catch(() => {
                staticVideo.remove();
            });
        });
    }

    return staticDiv;
}

function hideStaticTransition(staticDiv) {
    const staticVideo = staticDiv.querySelector('video');

    if (staticVideo) {
        staticVideo.pause();
    }

    staticDiv.classList.add('hidden');

    setTimeout(() => {
        if (staticDiv.parentElement) {
            staticDiv.remove();
        }
    }, 500);
}

function playChannel(index) {
    if (!videosLoaded || !isPlaybackOn) {
        return;
    }

    if (channelPlaylist.length === 0) {
        console.warn('Nao ha videos disponiveis nas categorias selecionadas.');
        return;
    }

    // O módulo permite circular do último canal para o primeiro, e vice-versa.
    currentChannelIndex = (index + channelPlaylist.length) % channelPlaylist.length;
    const version = ++playbackVersion;
    const videoFrame = document.getElementById('video-frame');
    const nextVideoUrl = channelPlaylist[currentChannelIndex];

    updateChannelDisplay();
    destroyCurrentPlayer();
    videoFrame.innerHTML = '';

    const staticDiv = showStaticTransition(videoFrame);

    createYouTubePlayer(nextVideoUrl, version)
        .then((player) => {
            if (!player || !isCurrentPlayback(version)) {
                return;
            }

            setTimeout(() => {
                if (isCurrentPlayback(version)) {
                    hideStaticTransition(staticDiv);
                }
            }, 1000);
        })
        .catch((error) => {
            if (!isCurrentPlayback(version)) {
                return;
            }

            console.error(error);
            skipUnavailableVideo(nextVideoUrl, 'erro-local');
        });

}

function playNextVideo() {
    // Avançar usa o índice já existente; não há novo sorteio aqui.
    playChannel(currentChannelIndex + 1);
}

function playPreviousVideo() {
    // Retroceder usa a mesma grade, portanto retorna ao vídeo já visto.
    playChannel(currentChannelIndex - 1);
}

function setTvLed(isOn) {
    // O CSS cuida da transição de brilho; o JavaScript só informa se a TV está ligada.
    document.getElementById('tvLed').classList.toggle('is-on', isOn);
}

function stopPlayback() {
    // Invalida também qualquer carregamento assíncrono ainda pendente.
    const togglePlaybackButton = document.getElementById('togglePlayback');
    const videoFrame = document.getElementById('video-frame');

    playbackVersion += 1;
    destroyCurrentPlayer();
    videoFrame.innerHTML = '';
    isPlaybackOn = false;
    setTvLed(false);
    togglePlaybackButton.innerText = 'Ligar TV';
    updatePlaybackButtonVisibility();
}

function togglePlayback() {
    const togglePlaybackButton = document.getElementById('togglePlayback');

    if (isPlaybackOn) {
        stopPlayback();
        return;
    }

    if (channelPlaylist.length === 0) {
        rebuildChannelPlaylist();
    }

    if (channelPlaylist.length === 0) {
        return;
    }

    isPlaybackOn = true;
    setTvLed(true);
    togglePlaybackButton.innerText = 'Desligar TV';
    updatePlaybackButtonVisibility();
    playChannel(currentChannelIndex >= 0 ? currentChannelIndex : 0);
}

function updatePlaybackButtonVisibility() {
    const togglePlaybackButton = document.getElementById('togglePlayback');
    const nextVideoButton = document.getElementById('nextVideo');
    const previousVideoButton = document.getElementById('previousVideo');
    const selectedCategory = hasSelectedCategory();
    const shouldEnableToggleButton = videosLoaded && (selectedCategory || isPlaybackOn);
    const shouldEnableChannelButtons = videosLoaded && selectedCategory && isPlaybackOn && channelPlaylist.length > 0;

    togglePlaybackButton.disabled = !shouldEnableToggleButton;
    nextVideoButton.disabled = !shouldEnableChannelButtons;
    previousVideoButton.disabled = !shouldEnableChannelButtons;
}

function handleCategoryChange() {
    // Os filtros definem uma nova grade. Se a TV estiver ligada, ela começa no canal 1 dessa grade.
    rebuildChannelPlaylist();

    if (isPlaybackOn) {
        if (channelPlaylist.length > 0) {
            playChannel(0);
        } else {
            stopPlayback();
        }
    }

    updatePlaybackButtonVisibility();
}

function clearProgramSelections() {
    categories.forEach(({ checkboxId }) => {
        document.getElementById(checkboxId).checked = false;
    });
    handleCategoryChange();
}

function applySiteVolume() {
    const staticVideo = document.querySelector('.static-video');

    if (currentPlayer && typeof currentPlayer.setVolume === 'function') {
        try {
            if (typeof currentPlayer.unMute === 'function' && siteVolume > 0) {
                currentPlayer.unMute();
            }

            currentPlayer.setVolume(siteVolume);
        } catch (error) {
            console.warn('Nao foi possivel aplicar volume ao player ainda.', error);
        }
    }

    if (staticVideo) {
        staticVideo.volume = siteVolume / 80;
        staticVideo.muted = siteVolume === 0;
    }
}

function setSiteVolume(nextVolume) {
    siteVolume = Math.max(0, Math.min(100, nextVolume));
    applySiteVolume();
}

function changeSiteVolume(delta) {
    setSiteVolume(siteVolume + delta);
}

window.setSiteVolume = setSiteVolume;
window.changeSiteVolume = changeSiteVolume;

function handleVolumeShortcut(event) {
    const ignoredTags = ['INPUT', 'TEXTAREA', 'SELECT'];

    if (ignoredTags.includes(event.target.tagName)) {
        return;
    }

    if (event.key === 'ArrowUp' || event.key === '+') {
        event.preventDefault();
        changeSiteVolume(10);
    }

    if (event.key === 'ArrowDown' || event.key === '-') {
        event.preventDefault();
        changeSiteVolume(-10);
    }

    if (event.key === 'ArrowRight') {
        const nextVideoButton = document.getElementById('nextVideo');

        if (!nextVideoButton.disabled) {
            event.preventDefault();
            nextVideoButton.click();
        }
    }

    if (event.key === 'ArrowLeft') {
        const previousVideoButton = document.getElementById('previousVideo');

        if (!previousVideoButton.disabled) {
            event.preventDefault();
            previousVideoButton.click();
        }
    }
}

function showVideoLoadError(error) {
    console.error(error);
    console.info('Se voce abriu o index.html direto como arquivo, rode um servidor local. Exemplo: python -m http.server 8000');

    document.getElementById('togglePlayback').innerText = 'Ligar TV';
    updatePlaybackButtonVisibility();
}

document.addEventListener('DOMContentLoaded', async () => {
    // Os controles só são liberados após JSONs e API do YouTube terminarem de carregar.
    document.getElementById('togglePlayback').disabled = true;
    document.getElementById('nextVideo').disabled = true;
    document.getElementById('previousVideo').disabled = true;

    categories.forEach(({ checkboxId }) => {
        document.getElementById(checkboxId).addEventListener('change', handleCategoryChange);
    });
    document.getElementById('clearProgramas').addEventListener('click', clearProgramSelections);
    document.getElementById('togglePlayback').addEventListener('click', togglePlayback);
    document.addEventListener('keydown', handleVolumeShortcut);
    document.getElementById('volumeDown').addEventListener('click', () => changeSiteVolume(-10));
    document.getElementById('volumeUp').addEventListener('click', () => changeSiteVolume(10));

    document.getElementById('nextVideo').addEventListener('click', () => {
        if (isPlaybackOn) {
            playNextVideo();
        }
    });
    document.getElementById('previousVideo').addEventListener('click', () => {
        if (isPlaybackOn) {
            playPreviousVideo();
        }
    });

    try {
        await Promise.all([loadAllVideoLists(), loadYouTubeApi()]);
        rebuildChannelPlaylist();
        updatePlaybackButtonVisibility();
    } catch (error) {
        showVideoLoadError(error);
    }
});











