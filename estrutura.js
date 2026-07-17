const videoSources = {
    programas: 'linksPropagandas.json',
    desenhos: 'linksDesenhos.json',
    filmes: 'linksFilmes.json',
    intervalosGlobo: 'linksIntervalosGlobo.json',
    jornais: 'linksJornais.json',
    entrevistas: 'linksEntrevista.json'
};

const videoLists = {
    programas: [],
    desenhos: [],
    filmes: [],
    intervalosGlobo: [],
    jornais: [],
    entrevistas: []
};

const unavailableVideos = new Set();

let isPlaybackOn = false;
let lastVideoUrl = null;
let videosLoaded = false;
let youtubeApiPromise = null;
let currentPlayer = null;
let siteVolume = 80;
let volumeDisplayTimeout = null;

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

    youtubeApiPromise = new Promise((resolve) => {
        const previousReadyCallback = window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
            if (typeof previousReadyCallback === 'function') {
                previousReadyCallback();
            }

            resolve(window.YT);
        };

        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
    });

    return youtubeApiPromise;
}

function parseYouTubeEmbedUrl(videoUrl) {
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

function getRandomVideo(videosArray) {
    if (videosArray.length === 0) {
        return null;
    }

    let nextVideoUrl;

    do {
        nextVideoUrl = videosArray[Math.floor(Math.random() * videosArray.length)];
    } while (videosArray.length > 1 && nextVideoUrl === lastVideoUrl);

    return nextVideoUrl;
}

function getSelectedVideos() {
    let selectedVideos = [];

    if (document.getElementById('programasCheckbox').checked) {
        selectedVideos = selectedVideos.concat(videoLists.programas);
    }

    if (document.getElementById('desenhosCheckbox').checked) {
        selectedVideos = selectedVideos.concat(videoLists.desenhos);
    }

    if (document.getElementById('filmesCheckbox').checked) {
        selectedVideos = selectedVideos.concat(videoLists.filmes);
    }

    if (document.getElementById('intervalosGloboCheckbox').checked) {
        selectedVideos = selectedVideos.concat(videoLists.intervalosGlobo);
    }

    if (document.getElementById('jornaisCheckbox').checked) {
        selectedVideos = selectedVideos.concat(videoLists.jornais);
    }
    if (document.getElementById('entrevistasCheckbox').checked) {
        selectedVideos = selectedVideos.concat(videoLists.entrevistas);
    }

    return selectedVideos;
}

function getAvailableSelectedVideos() {
    const selectedVideos = getSelectedVideos();
    const availableVideos = selectedVideos.filter((videoUrl) => !unavailableVideos.has(videoUrl));

    return availableVideos.length > 0 ? availableVideos : selectedVideos;
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

async function createYouTubePlayer(videoUrl) {
    await loadYouTubeApi();

    const videoFrame = document.getElementById('video-frame');
    const playerHost = document.createElement('div');
    const { videoId, playerVars } = parseYouTubeEmbedUrl(videoUrl);

    playerHost.id = 'youtube-player-host';
    videoFrame.appendChild(playerHost);

    currentPlayer = new YT.Player(playerHost, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars,
        events: {
            onReady: (event) => {
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
                if (window.YT && event.data === YT.PlayerState.PLAYING) {
                    disableYouTubeCaptions(event.target);
                }
            },
            onError: (event) => {
                skipUnavailableVideo(videoUrl, event.data);
            }
        }
    });
}

function skipUnavailableVideo(videoUrl, errorCode) {
    unavailableVideos.add(videoUrl);
    console.warn(`Video indisponivel, pulando para outro. Codigo YouTube: ${errorCode}`, videoUrl);

    if (isPlaybackOn) {
        playNextVideo();
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
    staticVideo.volume = siteVolume / 80;

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

function playNextVideo() {
    if (!videosLoaded) {
        return;
    }

    const videoFrame = document.getElementById('video-frame');
    const nextVideoUrl = getRandomVideo(getAvailableSelectedVideos());

    if (!nextVideoUrl) {
        return;
    }

    destroyCurrentPlayer();
    videoFrame.innerHTML = '';

    const staticDiv = showStaticTransition(videoFrame);

    createYouTubePlayer(nextVideoUrl)
        .then(() => {
            setTimeout(() => {
                hideStaticTransition(staticDiv);
            }, 1000);
        })
        .catch((error) => {
            console.error(error);
            skipUnavailableVideo(nextVideoUrl, 'erro-local');
        });

    lastVideoUrl = nextVideoUrl;
}

function togglePlayback() {
    const togglePlaybackButton = document.getElementById('togglePlayback');
    const videoFrame = document.getElementById('video-frame');

    if (isPlaybackOn) {
        destroyCurrentPlayer();
        videoFrame.innerHTML = '';
        togglePlaybackButton.innerText = 'Ligar TV';
        isPlaybackOn = false;
        return;
    }

    playNextVideo();
    togglePlaybackButton.innerText = 'Desligar TV';
    isPlaybackOn = true;
}

function updatePlaybackButtonVisibility() {
    const togglePlaybackButton = document.getElementById('togglePlayback');
    const nextVideoButton = document.getElementById('nextVideo');
    const hasSelectedCategory = document.getElementById('programasCheckbox').checked
        || document.getElementById('desenhosCheckbox').checked
        || document.getElementById('filmesCheckbox').checked
        || document.getElementById('intervalosGloboCheckbox').checked
        || document.getElementById('jornaisCheckbox').checked
        || document.getElementById('entrevistasCheckbox').checked
    const shouldEnableToggleButton = videosLoaded && (hasSelectedCategory || isPlaybackOn);
    const shouldEnableNextButton = videosLoaded && hasSelectedCategory;

    togglePlaybackButton.disabled = !shouldEnableToggleButton;
    nextVideoButton.disabled = !shouldEnableNextButton;
}

function clearProgramSelections() {
    document.getElementById('programasCheckbox').checked = false;
    document.getElementById('desenhosCheckbox').checked = false;
    document.getElementById('filmesCheckbox').checked = false;
    document.getElementById('intervalosGloboCheckbox').checked = false;
    document.getElementById('jornaisCheckbox').checked = false;
    document.getElementById('entrevistasCheckbox').checked = false;
    updatePlaybackButtonVisibility();
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
        staticVideo.volume = siteVolume / 100;
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
}

function showVideoLoadError(error) {
    console.error(error);
    console.info('Se voce abriu o index.html direto como arquivo, rode um servidor local. Exemplo: python -m http.server 8000');

    document.getElementById('togglePlayback').innerText = 'Ligar TV';
    updatePlaybackButtonVisibility();
}

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('togglePlayback').disabled = true;
    document.getElementById('nextVideo').disabled = true;

    document.getElementById('programasCheckbox').addEventListener('change', updatePlaybackButtonVisibility);
    document.getElementById('desenhosCheckbox').addEventListener('change', updatePlaybackButtonVisibility);
    document.getElementById('filmesCheckbox').addEventListener('change', updatePlaybackButtonVisibility);
    document.getElementById('intervalosGloboCheckbox').addEventListener('change', updatePlaybackButtonVisibility);
    document.getElementById('jornaisCheckbox').addEventListener('change', updatePlaybackButtonVisibility);
    document.getElementById('entrevistasCheckbox').addEventListener('change', updatePlaybackButtonVisibility);
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

    try {
        await loadAllVideoLists();
        loadYouTubeApi();
        updatePlaybackButtonVisibility();
    } catch (error) {
        showVideoLoadError(error);
    }
});





















