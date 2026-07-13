const videoSources = {
    programas: 'linksPropagandas.json',
    desenhos: 'linksDesenhos.json',
    filmes: 'linksFilmes.json',
    intervalosGlobo: 'linksIntervalosGlobo.json'
};

const videoLists = {
    programas: [],
    desenhos: [],
    filmes: [],
    intervalosGlobo: []
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
        rel: 0,
        playsinline: 1
    };

    if (url.searchParams.has('start')) {
        playerVars.start = url.searchParams.get('start');
    }

    if (url.searchParams.has('loop')) {
        playerVars.loop = url.searchParams.get('loop');
        playerVars.playlist = url.searchParams.get('playlist') || videoId;
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

    return selectedVideos;
}

function getAvailableSelectedVideos() {
    const selectedVideos = getSelectedVideos();
    const availableVideos = selectedVideos.filter((videoUrl) => !unavailableVideos.has(videoUrl));

    return availableVideos.length > 0 ? availableVideos : selectedVideos;
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
                event.target.setVolume(siteVolume);
                event.target.playVideo();
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

    setTimeout(async () => {
        try {
            videoFrame.innerHTML = '';
            await createYouTubePlayer(nextVideoUrl);
            videoFrame.appendChild(staticDiv);
            hideStaticTransition(staticDiv);
        } catch (error) {
            console.error(error);
            skipUnavailableVideo(nextVideoUrl, 'erro-local');
        }
    }, 1000);

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
        || document.getElementById('intervalosGloboCheckbox').checked;
    const shouldEnableButtons = videosLoaded && hasSelectedCategory;

    togglePlaybackButton.disabled = !shouldEnableButtons;
    nextVideoButton.disabled = !shouldEnableButtons;
}

function applySiteVolume() {
    const staticVideo = document.querySelector('.static-video');

    if (currentPlayer && typeof currentPlayer.setVolume === 'function') {
        try {
            currentPlayer.unMute();
            currentPlayer.setVolume(siteVolume);
        } catch (error) {
            console.warn('Nao foi possivel aplicar volume ao player ainda.', error);
        }
    }

    if (staticVideo) {
        staticVideo.volume = siteVolume / 100;
    }
}

function renderVolumeBars() {
    const barsContainer = document.getElementById('volume-bars');
    const activeBars = Math.round(siteVolume / 10);

    if (!barsContainer) {
        return;
    }

    barsContainer.innerHTML = '';

    for (let index = 1; index <= 10; index += 1) {
        const bar = document.createElement('div');
        bar.classList.add('volume-bar');

        if (index <= activeBars) {
            bar.classList.add('active');
        }

        barsContainer.appendChild(bar);
    }
}

function showVolumeDisplay() {
    const volumeDisplay = document.getElementById('volume-display');
    const volumeValue = document.getElementById('volume-value');

    if (!volumeDisplay || !volumeValue) {
        return;
    }

    volumeValue.innerText = siteVolume;
    renderVolumeBars();
    volumeDisplay.classList.add('visible');
    volumeDisplay.style.opacity = '1';

    clearTimeout(volumeDisplayTimeout);
    volumeDisplayTimeout = setTimeout(() => {
        volumeDisplay.classList.remove('visible');
        volumeDisplay.style.opacity = '';
    }, 1800);
}

function setSiteVolume(nextVolume) {
    siteVolume = Math.max(0, Math.min(100, nextVolume));
    applySiteVolume();
    showVolumeDisplay();
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
        setSiteVolume(siteVolume + 10);
    }

    if (event.key === 'ArrowDown' || event.key === '-') {
        event.preventDefault();
        setSiteVolume(siteVolume - 10);
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
    document.getElementById('togglePlayback').addEventListener('click', togglePlayback);
    document.addEventListener('keydown', handleVolumeShortcut);
    document.getElementById('volume-value').innerText = siteVolume;
    renderVolumeBars();

    document.getElementById('nextVideo').addEventListener('click', () => {
        if (isPlaybackOn) {
            playNextVideo();
        }
    });

    try {
        await loadAllVideoLists();
        updatePlaybackButtonVisibility();
    } catch (error) {
        showVideoLoadError(error);
    }
});











