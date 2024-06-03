const videos = [
    "https://www.youtube.com/embed/6he_c73pwjg?autoplay=1",
    "https://www.youtube.com/embed/LC_MAVPZ_w8?autoplay=1",
    "https://www.youtube.com/embed/drwS88sV6C4?autoplay=1",
    "https://www.youtube.com/embed/-DFXhXvjK6g?autoplay=1",
    "https://www.youtube.com/embed/OZ_q_ikyIUw?autoplay=1"
];

const desenhosVideos = [
    "https://www.youtube.com/embed/PsVVCilvVJE?autoplay=1",
    "https://www.youtube.com/embed/evvVvRTCcL4?autoplay=1",
    "https://www.youtube.com/embed/e5IUYHm78ts?autoplay=1",
    "https://www.youtube.com/embed/36v6XTKw1XI?autoplay=1"
];

const transitionVideoUrl = "C:\\Users\\morad\\OneDrive\\Documentos\\GitHub\\curso-JS\\trabalho\\TvStatic.mp4";

let isPlaybackOn = false;
let lastVideoIndex = -1;

function getRandomVideo(videosArray, lastIndex) {
    let randomIndex;
    do {
        randomIndex = Math.floor(Math.random() * videosArray.length);
    } while (randomIndex === lastIndex);
    return { url: videosArray[randomIndex], index: randomIndex };
}

function getNextRandomVideo() {
    let videosArray = [];

    if (document.getElementById('programasCheckbox').checked) {
        videosArray = videosArray.concat(videos);
    }

    if (document.getElementById('desenhosCheckbox').checked) {
        videosArray = videosArray.concat(desenhosVideos);
    }

    if (videosArray.length === 0) {
        return { url: null, index: -1 };
    }

    return getRandomVideo(videosArray, lastVideoIndex);
}

function playTransitionVideo(callback) {
    const videoFrame = document.getElementById('video-frame');
    videoFrame.innerHTML = `
        <iframe 
            width="560" 
            height="315" 
            src="${transitionVideoUrl}" 
            title="Transition video player" 
            frameborder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen
        ></iframe>`;
    
    // Assume que o vídeo de transição tem 5 segundos
    setTimeout(callback, 5000);
}

function playNextVideo() {
    const videoFrame = document.getElementById('video-frame');
    const nextVideo = getNextRandomVideo();

    if (nextVideo.url) {
        playTransitionVideo(() => {
            videoFrame.innerHTML = `
                <iframe 
                    width="560" 
                    height="315" 
                    src="${nextVideo.url}" 
                    title="YouTube video player" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    referrerpolicy="strict-origin-when-cross-origin" 
                    allowfullscreen
                ></iframe>`;
        });
    }

    lastVideoIndex = nextVideo.index;
}

function togglePlayback() {
    if (isPlaybackOn) {
        const videoFrame = document.getElementById('video-frame');
        videoFrame.innerHTML = '';
        document.getElementById('togglePlayback').innerText = 'Ligar TV';
        isPlaybackOn = false;
    } else {
        playNextVideo();
        document.getElementById('togglePlayback').innerText = 'Desligar TV';
        isPlaybackOn = true;
    }
}

function updatePlaybackButtonVisibility() {
    const nextVideoButton = document.getElementById('togglePlayback');
    if (document.getElementById('programasCheckbox').checked || document.getElementById('desenhosCheckbox').checked) {
        nextVideoButton.removeAttribute('disabled');
    } else {
        nextVideoButton.setAttribute('disabled', true);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updatePlaybackButtonVisibility();
    document.getElementById('programasCheckbox').addEventListener('change', updatePlaybackButtonVisibility);
    document.getElementById('desenhosCheckbox').addEventListener('change', updatePlaybackButtonVisibility);
    document.getElementById('togglePlayback').addEventListener('click', togglePlayback);
    document.getElementById('nextVideo').addEventListener('click', () => {
        if (isPlaybackOn) {
            playNextVideo();
        }
    });
    document.querySelector('a[href="#programas"]').addEventListener('click', () => {
        document.getElementById('programasCheckbox').checked = true;
        updatePlaybackButtonVisibility();
    });
    document.querySelector('a[href="#desenhos"]').addEventListener('click', () => {
        document.getElementById('desenhosCheckbox').checked = true;
        updatePlaybackButtonVisibility();
    });
});
