// --- IndexedDB Database Helpers ---
const DB_NAME = "CaseBookDB";
const DB_VERSION = 1;
const STORE_NAME = "cases";

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "Movie" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllCasesFromDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function saveCaseToDB(caseData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        // 'put' automatically updates existing records matching 'Movie' key
        const request = store.put(caseData);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// --- Tracking global metadata fields ---
let selectedMovieTitle = "";
let currentPosterPath = "";

document.addEventListener("DOMContentLoaded", async () => {
    const movieSearch = document.getElementById("movieSearch");
    const searchResults = document.getElementById("searchResults");
    const btnAddQuestion = document.getElementById("btnAddQuestion");
    const questionsContainer = document.getElementById("questionsContainer");
    const btnSaveCase = document.getElementById("btnSaveCase");

    const btnRevealSynopsis = document.getElementById("btnRevealSynopsis");
    const synopsisRevealBtnContainer = document.getElementById("synopsisRevealBtnContainer");
    const synopsisBlurWrapper = document.getElementById("synopsisBlurWrapper");

    // --- 1. Hook up the Reveal click listener action ---
    btnRevealSynopsis.addEventListener("click", () => {
        synopsisBlurWrapper.classList.add("revealed");
        synopsisRevealBtnContainer.classList.add("d-none");
    });

    // Load saved cases from IndexedDB immediately on page load
    await displaySavedCases();

    // --- 2. Async Proxy Search Handler ---
    movieSearch.addEventListener("input", async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            searchResults.classList.add("d-none");
            return;
        }

        try {
            // Fetch via Express backend proxy endpoint
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error("API call encountered issues");
            
            const data = await response.json();
            renderSearchResults(data.results);
        } catch (error) {
            console.error("Error pulling down movie data:", error);
        }
    });

    function renderSearchResults(movies) {
        searchResults.innerHTML = "";
        if (!movies || movies.length === 0) {
            searchResults.classList.add("d-none");
            return;
        }

        movies.slice(0, 6).forEach(movie => {
            const item = document.createElement("div");
            item.className = "dropdown-item-movie";
            const year = movie.release_date ? movie.release_date.split("-")[0] : "N/A";
            item.textContent = `${movie.title} (${year})`;
            
            item.addEventListener("click", () => {
                selectMovie(movie);
            });
            searchResults.appendChild(item);
        });
        searchResults.classList.remove("d-none");
    }

    function selectMovie(movie) {
        selectedMovieTitle = movie.title;
        movieSearch.value = movie.title;
        currentPosterPath = movie.poster_path || ""; 

        searchResults.classList.add("d-none");
        searchResults.innerHTML = ""; 

        document.getElementById("movieTitle").textContent = movie.title;
        document.getElementById("movieOverview").textContent = movie.overview || "No overview available.";
        
        synopsisBlurWrapper.classList.remove("revealed");
        if (movie.overview) {
            synopsisRevealBtnContainer.classList.remove("d-none");
        } else {
            synopsisRevealBtnContainer.classList.add("d-none");
        }
        
        if (movie.poster_path) {
            document.getElementById("moviePoster").src = `https://image.tmdb.org/t/p/w342${movie.poster_path}`;
        } else {
            document.getElementById("moviePoster").src = "https://placehold.co/150x225/12141c/2a2f3d?text=No+Poster";
        }
    }

    document.addEventListener("click", (e) => {
        if (e.target !== movieSearch) searchResults.classList.add("d-none");
    });

    // --- 3. Dynamic Question Controls ---
    btnAddQuestion.addEventListener("click", () => {
        const text = prompt("Enter your question:");
        if (!text || text.trim() === "") return;
        addQuestionRow(text.trim());
    });

    function addQuestionRow(questionText) {
        const row = document.createElement("div");
        row.className = "question-item";
        
        const span = document.createElement("span");
        span.className = "question-text";
        span.textContent = `• ${questionText}`;
        
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-sm btn-danger py-0 px-2";
        deleteBtn.textContent = "×";
        deleteBtn.addEventListener("click", () => row.remove());

        row.appendChild(span);
        row.appendChild(deleteBtn);
        questionsContainer.appendChild(row);
    }

    // --- 4. Save Payload via IndexedDB ---
    btnSaveCase.addEventListener("click", async (e) => {
        e.preventDefault(); 
        const questionElements = questionsContainer.querySelectorAll(".question-text");
        const questionsArray = Array.from(questionElements).map(el => el.textContent.replace(/^•\s*/, ""));
        const movieTitle = selectedMovieTitle || movieSearch.value || "Untitled Case";

        const caseData = {
            "Movie": movieTitle,
            "PosterPath": currentPosterPath,
            "Premise": document.getElementById("premise").value,
            "Promise": document.getElementById("promise").value,
            "Questions": questionsArray,
            "Hypothesis": document.getElementById("hypothesis").value,
            "General Notes": document.getElementById("generalNotes").value,
            "SavedAt": new Date().toISOString()
        };

        try {
            await saveCaseToDB(caseData);
            alert(`Case "${movieTitle}" saved!`);
            await displaySavedCases();
        } catch (err) {
            console.error("Failed to save case to IndexedDB:", err);
            alert("Error saving case to database.");
        }
    });

    const btnClearCase = document.getElementById("btnClearCase");
    btnClearCase.addEventListener("click", () => {
        wipeTheForm();
    });

    function wipeTheForm() {
        selectedMovieTitle = "";
        currentPosterPath = "";
        
        movieSearch.value = "";
        document.getElementById("premise").value = "";
        document.getElementById("promise").value = "";
        document.getElementById("hypothesis").value = "";
        document.getElementById("generalNotes").value = "";
        questionsContainer.innerHTML = "";
        
        document.getElementById("movieTitle").textContent = "—";
        document.getElementById("movieOverview").textContent = "Select a movie above to populate data.";
        document.getElementById("moviePoster").src = "https://placehold.co/150x225/12141c/2a2f3d?text=No+Poster";
        
        synopsisBlurWrapper.classList.remove("revealed");
        synopsisRevealBtnContainer.classList.add("d-none");
    }

    // --- 5. Display Saved Cases from IndexedDB ---
    async function displaySavedCases() {
        wipeTheForm();

        const savedCasesGrid = document.getElementById("savedCasesGrid");
        const caseCountBadge = document.getElementById("caseCountBadge");
        if (!savedCasesGrid) return;
        
        savedCasesGrid.innerHTML = "";
        
        const localCases = await getAllCasesFromDB();

        if (caseCountBadge) {
            caseCountBadge.textContent = `${localCases.length} Case${localCases.length === 1 ? '' : 's'} Logged`;
        }

        if (localCases.length === 0) {
            savedCasesGrid.innerHTML = `
                <div class="col-12 text-center small py-5 card bg-transparent border-secondary border-dashed" style="color: white;">
                    🕵️ Your investigation library is empty. Log your first case to get started!
                </div>`;
            return;
        }

        localCases.forEach(caseData => {
            const col = document.createElement("div");
            col.className = "col";
            
            const imgUrl = caseData.PosterPath 
                ? `https://image.tmdb.org/t/p/w342${caseData.PosterPath}`
                : `https://placehold.co/150x225/1a1d26/3a4154?text=${encodeURIComponent(caseData.Movie)}`;

            col.innerHTML = `
                <div class="card h-100 border-0 bg-transparent position-relative movie-poster-card" style="cursor: pointer;">
                    <div class="position-relative overflow-hidden rounded shadow" style="aspect-ratio: 2/3;">
                        <img src="${imgUrl}" class="card-img-top w-100 h-100 object-fit-cover transition-transform" style="transition: transform 0.2s;" alt="${caseData.Movie}">
                        <div class="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column justify-content-end p-2 opacity-0 hover-overlay" 
                             style="background: linear-gradient(to top, rgba(18,20,28,0.95) 0%, rgba(18,20,28,0.4) 100%); transition: opacity 0.2s; opacity: 0;">
                            <p class="text-white small fw-bold mb-1 text-truncate">${caseData.Movie}</p>
                            <p class="text-warning mb-0 text-truncate" style="font-size: 0.7rem;">${caseData.Hypothesis || 'No theory written yet.'}</p>
                        </div>
                    </div>
                </div>
            `;

            const posterContainer = col.querySelector('.movie-poster-card');
            const overlay = col.querySelector('.hover-overlay');
            const img = col.querySelector('img');
            
            posterContainer.addEventListener('mouseenter', () => {
                overlay.style.opacity = '1';
                img.style.transform = 'scale(1.05)';
            });
            posterContainer.addEventListener('mouseleave', () => {
                overlay.style.opacity = '0';
                img.style.transform = 'scale(1)';
            });

            posterContainer.addEventListener("click", () => {
                loadCaseIntoForm(caseData);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });

            savedCasesGrid.appendChild(col);
        });
    }

    function loadCaseIntoForm(caseData) {
        selectedMovieTitle = caseData.Movie;
        currentPosterPath = caseData.PosterPath || "";
        
        document.getElementById("movieSearch").value = caseData.Movie;
        document.getElementById("movieTitle").textContent = caseData.Movie;
        document.getElementById("premise").value = caseData.Premise || "";
        document.getElementById("promise").value = caseData.Promise || "";
        document.getElementById("hypothesis").value = caseData.Hypothesis || "";
        document.getElementById("generalNotes").value = caseData["General Notes"] || "";

        const questionsContainer = document.getElementById("questionsContainer");
        questionsContainer.innerHTML = "";
        if (caseData.Questions && Array.isArray(caseData.Questions)) {
            caseData.Questions.forEach(qText => addQuestionRow(qText));
        }
        
        if (caseData.PosterPath) {
            document.getElementById("moviePoster").src = `https://image.tmdb.org/t/p/w342${caseData.PosterPath}`;
        } else {
            document.getElementById("moviePoster").src = "https://placehold.co/150x225/12141c/2a2f3d?text=No+Poster";
        }

        synopsisBlurWrapper.classList.add("revealed");
        synopsisRevealBtnContainer.classList.add("d-none");
        document.getElementById("movieOverview").innerHTML = `<span class="text-warning">⚠️ LOADED CASE FILE</span>`;
    }
});