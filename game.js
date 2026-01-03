
/* --- CONFIG --- */
const TEAMS = ["CSK","RCB","MI","KKR","DC","RR","SRH","PBKS","LSG","GT"];
const MATCHES_PER_ROUND = [10, 10, 10, 10, 5]; // 45 matches total for single round robin
const COMMENTARY = {
  0: ["Good defense.", "Straight to the fielder.", "No run.", "Swing and a miss!"],
  1: ["Single taken.", "Pushed to long on.", "Quick run.", "Strike rotation."],
  2: ["In the gap for two.", "Good running.", "Couple of runs."],
  3: ["Great fielding saves one.", "Running hard for three."],
  4: ["SMASHED! 4 runs.", "Beautiful cover drive!", "One bounce boundary."],
  6: ["HUGE! It's a SIX!", "Out of the stadium!", "Monster hit!"],
  W: ["OUT! Clean bowled!", "Caught at slip!", "Run out disaster!", "Up in the air... GONE!"]
};

/* --- STATE --- */
let state = {
  schedule: [],
  stats: {},
  userTeam: "",
  matchIndex: 0,
  settings: { overs: 2, wickets: 3 },
  match: null, // Current active user match state
  currentScheduleView: 'R1'
};

/* --- TAB NAVIGATION --- */
function showTab(tabName) {
    document.getElementById('currentMatchContent').style.display = 'none';
    document.getElementById('scheduleContent').style.display = 'none';
    document.getElementById('pointsContent').style.display = 'none';
    
    document.getElementById('tabCurrentMatch').classList.remove('active');
    document.getElementById('tabSchedule').classList.remove('active');
    document.getElementById('tabPoints').classList.remove('active');

    if (tabName === 'currentMatch') {
        document.getElementById('currentMatchContent').style.display = 'flex';
        document.getElementById('tabCurrentMatch').classList.add('active');
        updateCurrentMatchTabUI();
    } else if (tabName === 'schedule') {
        document.getElementById('scheduleContent').style.display = 'flex'; 
        document.getElementById('tabSchedule').classList.add('active');
        renderScheduleNav(); // Ensure nav buttons exist
        renderScheduleList(state.currentScheduleView); // Render the current view
    } else if (tabName === 'points') {
        document.getElementById('pointsContent').style.display = 'flex';
        document.getElementById('tabPoints').classList.add('active');
        updateTable();
    }
}

function updateCurrentMatchTabUI() {
    const currentMatch = state.schedule[state.matchIndex];
    const isUserMatch = currentMatch && (currentMatch.t1 === state.userTeam || currentMatch.t2 === state.userTeam);

    // Hide all game UI elements initially
    document.getElementById('gameUI').style.display = 'none';
    document.getElementById('playMatchBtn').style.display = 'none';
    document.getElementById('simBtn').disabled = false;
    
    // Update Match Info in Idle state
    if (!currentMatch || currentMatch.played) {
        document.getElementById('noMatchUI').style.display = 'flex';
        document.getElementById('nextMatchInfo').innerText = currentMatch ? 
            `Next Match: ${currentMatch.t1} vs ${currentMatch.t2}` : 
            "Tournament Complete! Check Points Table for Winner.";
    }

    if (isUserMatch && !currentMatch.played) {
        // Ready to play the user match
        document.getElementById('noMatchUI').style.display = 'flex';
        document.getElementById('nextMatchInfo').innerHTML = `
            Your Next Match:<br><b>${currentMatch.t1} vs ${currentMatch.t2}</b>
        `;
        document.getElementById('playMatchBtn').style.display = 'inline-block';
        document.getElementById('simBtn').disabled = true; // Cannot simulate past a user match
    } else if (state.match && state.match.meta && !state.match.meta.played) {
        // Match is active (in toss/play/result screens)
        document.getElementById('noMatchUI').style.display = 'none';
        document.getElementById('gameUI').style.display = 'block';
        document.getElementById('simBtn').disabled = true;
    } else if (currentMatch && !isUserMatch && !currentMatch.played) {
        // AI match waiting to be simulated
        document.getElementById('noMatchUI').style.display = 'flex';
        document.getElementById('nextMatchInfo').innerText = `Next Match to Simulate: ${currentMatch.t1} vs ${currentMatch.t2}`;
    }
}


/* --- INITIALIZATION --- */
function initApp(){
  document.body.classList.add("landing");
  const sel = document.getElementById('teamSelect');
  TEAMS.forEach(t => sel.add(new Option(t,t)));
  renderKeypad();
}

function renderKeypad(){
  const pad = document.getElementById('keypad');
  pad.innerHTML = '';
  [1,2,3,4,6].forEach(n => {
    const b = document.createElement('button');
    b.className = 'hand-btn';
    b.innerText = n;
    b.onclick = () => playBall(n);
    pad.appendChild(b);
  });
  const b = document.createElement('button');
  b.className = 'hand-btn';
  b.style.border = '1px solid #aaa';
  b.innerText = '0';
  b.onclick = () => playBall(0);
  pad.appendChild(b);
}


/* --- AI LOGIC (Unchanged) --- */

function weightedRandom(weights) {
    let total = 0;
    for (const run in weights) {
        if (weights[run] > 0) {
            total += weights[run];
        }
    }
    if (total <= 0) return Math.floor(Math.random() * 7);

    let r = Math.random() * total;
    for (const run in weights) {
        if (weights[run] > 0) {
            r -= weights[run];
            if (r <= 0) {
                return parseInt(run);
            }
        }
    }
    return 1;
}

function getRunFrequencies(runs) {
    const freq = {};
    runs.forEach(r => freq[r] = (freq[r] || 0) + 1);
    
    let mostCommonRun = -1;
    let maxCount = 0;
    
    // Check for a run played 3 or more times in the last 6 balls
    for (const run in freq) {
        if (freq[run] > maxCount && freq[run] >= 3) {
            maxCount = freq[run];
            mostCommonRun = parseInt(run);
        }
    }
    return { mostCommonRun, maxCount };
}

/**
 * Determines the AI's run choice based on the match situation and user predictability.
 */
function getSmartAIRun(isAI_Batting) {
    const m = state.match;
    
    // --- AI STRATEGY ---

    // 1. AI BOWLING (User is BATting/Bowling): PREDATORY MODE (Targeting big scores, minimizing small scores)
    if (!isAI_Batting) {
        // Base weights: High chance for 3, 4, 6, minimal for 0, 1, 2
        let bowlingWeights = { 0: 5, 1: 5, 2: 10, 3: 20, 4: 30, 6: 30 }; 
        const { mostCommonRun, maxCount } = getRunFrequencies(m.userRecentBattingRuns);

        // Analyze User Pattern (Wicket Maximization)
        if (mostCommonRun !== -1) {
            // User is predictable. AI heavily tries to match that run for a WICKET.
            const originalWeight = bowlingWeights[mostCommonRun] || 0;
            const boostFactor = 40 + (maxCount * 10); 
            bowlingWeights[mostCommonRun] = originalWeight + boostFactor;
            
            // Slightly reduce other weights proportionally to keep the AI focused
            Object.keys(bowlingWeights).forEach(run => {
                const r = parseInt(run);
                if (r !== mostCommonRun) {
                    bowlingWeights[r] = Math.max(5, bowlingWeights[r] * 0.8);
                }
            });
        }
        
        // Ensure that in general, 1 and 2 remain very low probability unless targeted
        bowlingWeights[1] = Math.min(10, bowlingWeights[1] || 5);
        bowlingWeights[2] = Math.min(15, bowlingWeights[2] || 10);
        
        return weightedRandom(bowlingWeights);
    }

    // 2. AI BATTING (User is BOWLing): DYNAMIC AGGRESSIVE CHASE MODE (Maximizing big scores)
    else {
        // Default base weights: Focus on 2, 3, 4, 6 (1s and 0s minimal)
        let battingWeights = { 0: 3, 1: 5, 2: 15, 3: 15, 4: 30, 6: 32 }; 
        
        // --- Score/Chase Strategy (Applies first) ---
        const runsNeeded = m.target - m.score;
        const ballsLeft = m.balls;
        const requiredRate = ballsLeft > 0 ? (runsNeeded / (ballsLeft / 6)) : Infinity;
        
        if (m.innings === 1) {
             // Innings 1: Aggressive but diverse. Target RRR of ~9.5
             // Use default aggressive weights
        } else if (runsNeeded <= 0) {
            // Done - Safety (but still avoid 0, 1 for consistent style)
            battingWeights = { 0: 5, 1: 15, 2: 50, 3: 20, 4: 10 }; 
        } else if (requiredRate <= 6) { 
            // Easy Chase (RRR <= 6): Prioritize 2s and 3s, but keep boundaries high
            battingWeights = { 0: 3, 1: 5, 2: 30, 3: 20, 4: 25, 6: 17 };
        } else if (requiredRate <= 8) { 
            // Standard Chase (6 < RRR <= 8): Balance (2, 4, 6)
            battingWeights = { 0: 3, 1: 5, 2: 20, 3: 15, 4: 30, 6: 27 };
        } else if (requiredRate <= 10) { 
            // Moderate Chase (8 < RRR <= 10): More aggression (4, 6)
            battingWeights = { 0: 1, 1: 2, 2: 10, 3: 5, 4: 35, 6: 47 };
        } else { 
            // Hard Chase (RRR > 10): Pure aggression (Maximize 6s)
            battingWeights = { 0: 1, 1: 1, 2: 5, 3: 5, 4: 40, 6: 48 };
        }
        
        // --- Defensive Prediction Adjustment (Applies second) ---
        const { mostCommonRun, maxCount } = getRunFrequencies(m.userRecentBowlingRuns);

        if (mostCommonRun !== -1 && battingWeights[mostCommonRun] > 0) {
            // User is predictable (AI bowler keeps repeating a number). AI avoids playing that number.
            
            const originalWeight = battingWeights[mostCommonRun];
            
            // Reduce weight significantly (95% reduction for safety)
            const reductionFactor = originalWeight * 0.95; 

            // Reduce weight of the predictable run (down to a minimum of 0)
            const newWeight = Math.max(0, originalWeight - reductionFactor);
            battingWeights[mostCommonRun] = newWeight;
            
            const weightToRedistribute = originalWeight - newWeight;
            
            // Prioritize where to dump the unused weight into high scoring runs
            let runsToBoost = [6, 4, 3, 2].filter(r => r !== mostCommonRun);
            

            if (runsToBoost.length > 0) {
                const addedWeightPerRun = weightToRedistribute / runsToBoost.length;
                runsToBoost.forEach(run => {
                    battingWeights[run] = (battingWeights[run] || 0) + addedWeightPerRun;
                });
            }
        }
        
        return weightedRandom(battingWeights);
    }
}


/* --- TOURNAMENT LOGIC --- */
function generateSchedule(){
  let matches = [];
  // Single Round Robin League (Each team plays every other team once)
  for(let i=0; i<TEAMS.length; i++){
    for(let j=i+1; j<TEAMS.length; j++){
      matches.push({ id: 0, t1: TEAMS[i], t2: TEAMS[j], played: false, res: null, type: 'League', scores: { inn1: { team: null, score: 0, wkt: 0, balls: 0, overs: [], runs: [] }, inn2: { team: null, score: 0, wkt: 0, balls: 0, overs: [], runs: [] } } });
    }
  }
  const leagueMatches = matches.slice();
  for (let i = leagueMatches.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [leagueMatches[i], leagueMatches[j]] = [leagueMatches[j], leagueMatches[i]];
  }
  
  return leagueMatches.map((m, i) => ({...m, id: i}));
}

function getPointsTableOrder(){
    return TEAMS.map(t => ({...state.stats[t], name:t})).sort((a,b) => {
        if(b.pts !== a.pts) return b.pts - a.pts;
        return b.pd - a.pd;
    });
}

function startPlayoffs(){
    const finalTable = getPointsTableOrder();
    const top4 = finalTable.slice(0, 4).map(t => t.name);

    if (top4.length < 4) {
        alert("Not enough teams for playoffs!");
        return;
    }

    const nextId = state.schedule.length;
    let playoffSchedule = [];
    
    // SF 1: Rank 1 vs Rank 4
    playoffSchedule.push({ id: nextId, t1: top4[0], t2: top4[3], played: false, res: null, type: 'SF1', winner: null, scores: { inn1: { team: null, score: 0, wkt: 0, balls: 0, overs: [], runs: [] }, inn2: { team: null, score: 0, wkt: 0, balls: 0, overs: [], runs: [] } } });
    
    // SF 2: Rank 2 vs Rank 3
    playoffSchedule.push({ id: nextId + 1, t1: top4[1], t2: top4[2], played: false, res: null, type: 'SF2', winner: null, scores: { inn1: { team: null, score: 0, wkt: 0, balls: 0, overs: [], runs: [] }, inn2: { team: null, score: 0, wkt: 0, balls: 0, overs: [], runs: [] } } });
    
    // Final (Placeholder)
    playoffSchedule.push({ id: nextId + 2, t1: "TBD", t2: "TBD", played: false, res: null, type: 'Final', winner: null, scores: { inn1: { team: null, score: 0, wkt: 0, balls: 0, overs: [], runs: [] }, inn2: { team: null, score: 0, wkt: 0, balls: 0, overs: [], runs: [] } } });
    
    state.schedule.push(...playoffSchedule);
    alert("League Stage Complete! Playoffs Begin. Top 4: " + top4.join(', '));
    showTab('schedule');
}


function initTournament(){
  document.body.classList.remove("landing");
  state.userTeam = document.getElementById('teamSelect').value;
  state.settings.overs = parseInt(document.getElementById('oversInput').value);
  state.settings.wickets = parseInt(document.getElementById('wicketsInput').value);
  state.matchIndex = 0;
  
  state.stats = {};
  TEAMS.forEach(t => state.stats[t] = { p:0, w:0, l:0, t:0, pts:0, pd:0 });

  state.schedule = generateSchedule(); 
  
  // Switch from Welcome Screen to Tournament UI
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('tournamentUI').style.display = 'grid';
  document.getElementById('userTeamDisplay').innerText = state.userTeam;
  
  showTab('currentMatch');
}

function renderScheduleNav() {
    const nav = document.getElementById('scheduleNav');
    if(nav.children.length > 0) return; // Only render once

    let roundIndex = 1;
    let navHTML = '';

    // League Rounds
    for (let i = 0; i < MATCHES_PER_ROUND.length; i++) {
        navHTML += `<button class="schedule-nav-btn" onclick="setScheduleView('R${roundIndex}')">Round ${roundIndex}</button>`;
        roundIndex++;
    }

    // Playoffs
    navHTML += `<button class="schedule-nav-btn" onclick="setScheduleView('P')">Playoffs</button>`;
    
    nav.innerHTML = navHTML;
    setScheduleView('R1'); // Default to R1
}

function setScheduleView(view) {
    state.currentScheduleView = view;
    // Highlight the active button
    document.querySelectorAll('.schedule-nav-btn').forEach(btn => {
        // Simple way to match text content to current view key
        const btnText = btn.innerText;
        const isActive = (view.startsWith('R') && btnText.includes(`Round ${view.replace('R','')}`)) || (view === 'P' && btnText.includes('Playoffs'));
        
        if (isActive) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderScheduleList(view);
}


function renderScheduleList(viewKey){
  const list = document.getElementById('scheduleList');
  list.innerHTML = '';
  let activeMatchElement = null;

  let startIndex = 0;
  let endIndex = 0;
  let isPlayoffs = false;

  if (viewKey === 'P') {
      startIndex = MATCHES_PER_ROUND.reduce((sum, current) => sum + current, 0); // Start after all league matches
      endIndex = state.schedule.length;
      isPlayoffs = true;
  } else {
      const roundNum = parseInt(viewKey.replace('R', ''));
      for (let i = 0; i < roundNum - 1; i++) {
          startIndex += MATCHES_PER_ROUND[i];
      }
      endIndex = startIndex + MATCHES_PER_ROUND[roundNum - 1];
  }

  const matchesToShow = state.schedule.slice(startIndex, endIndex);

  const header = document.createElement('div');
  header.className = 'sched-group-header';
  header.innerText = isPlayoffs ? 'Playoff Stage' : `League Matches (Round ${viewKey.replace('R', '')})`;
  list.appendChild(header);

  matchesToShow.forEach((m, i) => {
    const d = document.createElement('div');
    const isUser = (m.t1 === state.userTeam || m.t2 === state.userTeam);
    d.className = `sched-item ${m.played ? 'played' : ''} ${isUser ? 'user-match' : ''} ${m.type !== 'League' ? 'playoff' : ''}`;
    
    if(m.id === state.matchIndex && !m.played) {
        d.classList.add('active');
        activeMatchElement = d;
    }
    
    const label = m.type === 'Final' ? '🏆 FINAL' : m.type;
    const name = m.type === 'League' ? `${m.t1} vs ${m.t2}` : `${label}: ${m.t1} vs ${m.t2}`;

    d.innerHTML = `
      <div style="flex:1"><b>${m.id+1}.</b> ${name}</div>
      ${m.played ? `<div class="result-tag" style="background: ${m.res.includes('Tie') ? 'rgba(255, 255, 255, 0.1)' : m.res.includes('won') ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 75, 75, 0.1)'}; color: ${m.res.includes('Tie') ? '#fff' : m.res.includes('won') ? 'var(--success)' : 'var(--danger)'};">${m.res}</div>` : 
      `<div style="font-size: 11px; color: var(--accent);">UP NEXT</div>`}
    `;
    list.appendChild(d);
  });
  
  if(activeMatchElement) {
    // Scroll the schedule list to show the active match
    if(document.getElementById('scheduleContent').style.display !== 'none') {
        setTimeout(() => {
            activeMatchElement.scrollIntoView({behavior:'smooth', block: 'nearest'});
        }, 100);
    }
  }
  
  document.getElementById('logSummary').innerText = state.schedule.filter(m => m.played).length;
}

/* --- SIMULATION --- */
function simulateUntilUser(){
  document.getElementById('simBtn').disabled = true;
  document.getElementById('playMatchBtn').style.display = 'none';
  
  function step(){
    if(state.matchIndex >= state.schedule.length){
      // Tournament finished
      alert(`Tournament Complete! Champion: ${state.schedule.filter(m => m.type === 'Final')[0].winner || 'TBD'}`);
      document.getElementById('simBtn').disabled = true;
      updateCurrentMatchTabUI();
      return;
    }

    const m = state.schedule[state.matchIndex];
    
    if(m.t1 === state.userTeam || m.t2 === state.userTeam){
        // Found the user match, stop simulation and update UI
        updateCurrentMatchTabUI(); 
        renderScheduleList(state.currentScheduleView);
        return; 
    }
    
    if(m.type === 'Final' && (m.t1 === 'TBD' || m.t2 === 'TBD')){
      const finishedSFs = state.schedule.filter(s => s.played && s.type.startsWith('SF'));
      if(finishedSFs.length < 2) {
         document.getElementById('simBtn').disabled = false; 
         return; 
      }
    }

    // AI Match or Playoff Simulation
    if (m.type !== 'League') simPlayoffMatch(m);
    else simAIMatch(m);
    
    state.matchIndex++;
    updateTable();
    renderScheduleList(state.currentScheduleView); 
    
    // Check if league ended (45 matches for single round robin with 10 teams)
    if (state.matchIndex === 45 && state.schedule.length === 45) {
        startPlayoffs();
    }
    
    // Update Final match bracket if SFs finished
    if (m.type.startsWith('SF')) updateFinalBracket(m);

    const h = document.getElementById('historyLog');
    const div = document.createElement('div');
    div.innerText = `Match ${state.schedule.filter(m => m.played).length}: ${m.t1} vs ${m.t2} -> ${m.res}`;
    h.insertBefore(div, h.firstChild);

    // Continue simulation fast
    setTimeout(step, 10);
  }
  step();
}

function updateFinalBracket(m) {
    const finalMatch = state.schedule.find(match => match.type === 'Final');
    if (!finalMatch) return;

    if (m.type === 'SF1') {
        finalMatch.t1 = m.winner;
    } else if (m.type === 'SF2') {
        finalMatch.t2 = m.winner;
    }
    renderScheduleList(state.currentScheduleView);
}

// Helper to generate realistic AI scores and save score details
function generateAIInningsScore(m, t, target = Infinity) {
    const totalBalls = state.settings.overs * 6;
    let score = 0;
    let wickets = 0;
    let ballCount = 0;
    let oversRuns = [];
    let allRuns = [];
    
    while(ballCount < totalBalls && wickets < state.settings.wickets) {
        let runs = Math.floor(Math.random() * 7); // 0, 1, 2, 3, 4, 5, 6. (5 acts as a wicket/dot for simplicity in AI sim)
        if (runs === 5) runs = 0; // Treat 5 as a dot ball for AI simulation runs
        
        if (Math.random() < 0.1 && runs !== 0) { // 10% chance for a random wicket on scoring shot
            wickets++;
            runs = 0; 
        } else {
            score += runs;
        }

        allRuns.push(runs > 0 ? runs : (wickets > oversRuns[oversRuns.length - 1]?.wkt || 0) ? 'W' : 0);
        ballCount++;

        // End of over logic for score tracking
        if (ballCount % 6 === 0 || ballCount === totalBalls || wickets === state.settings.wickets || score >= target) {
            oversRuns.push({ 
                runs: score, 
                wkt: wickets, 
                balls: ballCount,
                runsInOver: allRuns.slice(oversRuns.reduce((sum, over) => sum + over.runsInOver.length, 0)) // Calculate runs in this segment
            });
        }

        if (score >= target) break;
    }

    // Ensure final run breakdown matches length of runs array
    if(oversRuns.length === 0 && ballCount > 0) {
       oversRuns.push({ runs: score, wkt: wickets, balls: ballCount, runsInOver: allRuns });
    } else if (oversRuns.length > 0 && oversRuns[oversRuns.length-1].balls !== ballCount) {
        // Handle incomplete last over case not captured by the %6 check
        oversRuns.push({ 
            runs: score, 
            wkt: wickets, 
            balls: ballCount, 
            runsInOver: allRuns.slice(oversRuns.reduce((sum, over) => sum + over.runsInOver.length, 0))
        });
    }

    return { 
        team: t,
        score: score, 
        wkt: wickets, 
        balls: ballCount,
        overs: oversRuns, 
        runs: allRuns 
    };
}


function simAIMatch(m){
    const t1 = m.t1;
    const t2 = m.t2;

    // Innings 1
    const inn1 = generateAIInningsScore(m, t1);
    m.scores.inn1 = inn1;
    const target = inn1.score + 1;

    // Innings 2
    const inn2 = generateAIInningsScore(m, t2, target);
    m.scores.inn2 = inn2;
    
    processResult(m, inn1.score, inn2.score);
}

function simPlayoffMatch(m){
    const t1 = m.t1;
    const t2 = m.t2;

    // Innings 1
    const inn1 = generateAIInningsScore(m, t1);
    m.scores.inn1 = inn1;
    const target = inn1.score + 1;

    // Innings 2
    const inn2 = generateAIInningsScore(m, t2, target);
    m.scores.inn2 = inn2;

    // If score is tied in playoffs, increase T1 score by 1 for deterministic result
    if (inn1.score === inn2.score) {
        inn1.score++; 
        // Also update score in tracking
        m.scores.inn1.score = inn1.score;
        
        // Find the last over in inn1 scores and update its run total
        if(m.scores.inn1.overs.length > 0) {
            const lastOver = m.scores.inn1.overs[m.scores.inn1.overs.length-1];
            lastOver.runs = inn1.score;
            lastOver.runsInOver.push(1); // Add a single run to the last over's runs array
            m.scores.inn1.runs.push(1); // Add a single run to the main runs array
        } else {
             // Edge case: 0/0 and a tie means the first over needs to be initialized
             m.scores.inn1.overs.push({ runs: 1, wkt: 0, balls: 1, runsInOver: [1] });
             m.scores.inn1.balls = 1;
             m.scores.inn1.runs.push(1);
        }
    }
    
    processResult(m, inn1.score, inn2.score);
    m.winner = inn1.score > inn2.score ? m.t1 : m.t2;
}

function processResult(m, s1, s2){
  m.played = true;
  let winner = null;
  let diff = s1 - s2;

  if(s1 > s2) winner = m.t1;
  else if(s2 > s1) winner = m.t2;
  else winner = "TIE";

  m.res = winner === "TIE" ? `Tie (${s1}-${s2})` : `${winner} won by ${Math.abs(diff)} runs (${s1}-${s2})`;
  
  if (m.type === 'League') {
      const st1 = state.stats[m.t1];
      const st2 = state.stats[m.t2];
      st1.p++; st2.p++;
      st1.pd += diff; st2.pd -= diff;

      if(winner === m.t1) { st1.w++; st1.pts+=2; st2.l++; }
      else if(winner === m.t2) { st2.w++; st2.pts+=2; st1.l++; }
      else { st1.t++; st2.t++; st1.pts++; st2.pts++; }
  }
}

function getRankEmoji(rank) {
    if (rank === 1) return '<span class="rank-1">🥇</span>';
    if (rank === 2) return '<span class="rank-2">🥈</span>';
    if (rank === 3) return '<span class="rank-3">🥉</span>';
    return `<span style="color:#888;">#${rank}</span>`;
}

function updateTable(){
  const tbody = document.getElementById('ptBody');
  tbody.innerHTML = '';
  
  const sorted = getPointsTableOrder();

  sorted.forEach((t, index) => {
    const tr = document.createElement('tr');
    if(t.name === state.userTeam) tr.className = 'hl-row';
    
    const pdClass = t.pd > 0 ? 'pd-positive' : (t.pd < 0 ? 'pd-negative' : '');
    const pdText = t.pd > 0 ? '+'+t.pd : t.pd;

    tr.innerHTML = `
        <td class="rank-td">${getRankEmoji(index + 1)}</td>
        <td><b>${t.name}</b></td>
        <td>${t.p}</td>
        <td>${t.w}</td>
        <td><b style="color:var(--gold);">${t.pts}</b></td>
        <td class="${pdClass}">${pdText}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* --- USER MATCH PLAY LOGIC & SCORECARD --- */

function startCurrentMatch() {
    const m = state.schedule[state.matchIndex];
    if (m.played || !(m.t1 === state.userTeam || m.t2 === state.userTeam)) return;

    startUserMatch(m);
}

function startUserMatch(m){
  state.match = {
    meta: m,
    userBatFirst: false,
    innings: 1,
    balls: state.settings.overs * 6,
    wktLeft: state.settings.wickets,
    score: 0,
    oppScore: 0,
    target: 0,
    userRecentBattingRuns: [], 
    userRecentBowlingRuns: [],
    // Score tracking for scorecard
    inn1Runs: [], // Stores runs/wickets for Inning 1
    inn2Runs: [], // Stores runs/wickets for Inning 2
    inn1Overs: [], // Summary points after each over
    inn2Overs: [], // Summary points after each over
    ballInOver: 0,
    isOverBreak: false // NEW state to pause play at end of over
  };

  // Switch UI to game mode
  document.getElementById('noMatchUI').style.display = 'none';
  document.getElementById('gameUI').style.display = 'block';
  document.getElementById('tossUI').style.display = 'block';
  document.getElementById('playUI').style.display = 'none';
  document.getElementById('resultUI').style.display = 'none';
  
  const userTeamName = state.userTeam;
  const aiTeamName = m.t1 === userTeamName ? m.t2 : m.t1;

  document.getElementById('pTeam').innerText = userTeamName;
  document.getElementById('aiTeam').innerText = aiTeamName;
  
  // Disable controls while playing
  document.getElementById('simBtn').disabled = true;
  document.getElementById('playMatchBtn').style.display = 'none';
  
  // Start Toss sequence
  document.getElementById('myMove').innerText = '-';
  document.getElementById('oppMove').innerText = '-';
  document.getElementById('tossControls').style.display = 'none';
  document.getElementById('tossMsg').innerText = "Toss Time";
  document.getElementById('matchStatus').innerText = "Awaiting Toss...";


  setTimeout(() => {
    const userWin = Math.random() > 0.5;
    if(userWin){
      document.getElementById('tossMsg').innerText = "You Won the Toss! Choose action:";
      document.getElementById('tossControls').style.display = 'flex';
    } else {
      const aiBat = Math.random() > 0.5;
      state.match.userBatFirst = !aiBat;
      document.getElementById('tossMsg').innerText = `Opponent won toss and chose to ${aiBat?'Bat':'Bowl'}`;
      setTimeout(() => initInnings(1), 2000);
    }
  }, 500);
}

function userTossDecision(bat){
  state.match.userBatFirst = bat;
  initInnings(1);
}

function initInnings(inn){
  state.match.innings = inn;
  state.match.balls = state.settings.overs * 6;
  state.match.wktLeft = state.settings.wickets;
  state.match.score = 0;
  state.match.ballInOver = 0; // Reset ball counter for the new innings
  state.match.isOverBreak = false;

  document.getElementById('tossUI').style.display = 'none';
  document.getElementById('playUI').style.display = 'block';
  document.getElementById('nextInnBtn').style.display = 'none';
  document.getElementById('keypad').style.display = 'grid';
  document.getElementById('overBreakPrompt').style.display = 'none';
  // REMOVED: document.getElementById('commLog').innerHTML = '';
  
  updateInningContext();
  updateScoreBoard();
  addHistoryLog(`--- Match ${state.matchIndex + 1}: Innings ${inn} Begins ---`, false);
}

function updateInningContext() {
    const m = state.match;
    const isUserBatting = (m.innings === 1 && m.userBatFirst) || (m.innings === 2 && !m.userBatFirst);
    const userTeam = state.userTeam;
    const oppTeam = m.meta.t1 === userTeam ? m.meta.t2 : m.meta.t1;
    
    let statusText = "";
    if (m.innings === 1) {
        statusText = isUserBatting ? `${userTeam} Batting. You are BATTING.` : `${oppTeam} Batting. You are BOWLING.`;
    } else {
        const runsNeeded = m.target - m.score;
        statusText = isUserBatting ? 
            `${userTeam} Batting. You are CHASING ${m.target} (Need ${runsNeeded})` : 
            `${oppTeam} Batting. AI is CHASING ${m.target} (Need ${runsNeeded})`;
    }

    document.getElementById('matchStatus').innerText = statusText;
    document.getElementById('inningInfo').innerText = `Innings ${m.innings}`;
}


function updateScoreBoard(){
  document.getElementById('uiScore').innerText = `${state.match.score}/${state.settings.wickets - state.match.wktLeft}`;
  document.getElementById('uiBalls').innerText = state.match.balls;
  
  if(state.match.innings === 2){
    let needed = (state.match.target) - state.match.score;
    if(needed < 0) needed = 0;
    document.getElementById('uiTarget').innerText = needed;
    document.getElementById('uiTargetLbl').innerText = "Runs Needed";
    document.getElementById('uiTarget').style.color = 'var(--danger)';
  } else {
    document.getElementById('uiTarget').innerText = "--";
    document.getElementById('uiTargetLbl').innerText = "Target";
    document.getElementById('uiTarget').style.color = '#fff';
  }
}

function playBall(userRun){
  const m = state.match;
  if(m.isOverBreak || document.getElementById('keypad').style.display === 'none') return;

  const isUserBatting = (m.innings === 1 && m.userBatFirst) || (m.innings === 2 && !m.userBatFirst);
  
  const aiChoice = getSmartAIRun(!isUserBatting); 
  
  let bowlerRun = isUserBatting ? aiChoice : userRun; 
  let batterRun = isUserBatting ? userRun : aiChoice; 

  // Track user's move for AI prediction next ball
  if(isUserBatting) {
      m.userRecentBattingRuns.push(userRun);
      if (m.userRecentBattingRuns.length > 6) m.userRecentBattingRuns.shift();
  } else {
      m.userRecentBowlingRuns.push(userRun);
      if (m.userRecentBowlingRuns.length > 6) m.userRecentBowlingRuns.shift();
  }

  document.getElementById('myMove').innerText = userRun;
  document.getElementById('oppMove').innerText = aiChoice;

  let runs = 0;
  let isOut = false;

  if(userRun === aiChoice){
    isOut = true;
    m.wktLeft--;
    document.getElementById('myMoveBox').classList.add('wicket-anim');
    document.getElementById('oppMoveBox').classList.add('wicket-anim');
    setTimeout(() => {
        document.getElementById('myMoveBox').classList.remove('wicket-anim');
        document.getElementById('oppMoveBox').classList.remove('wicket-anim');
    }, 400);
  } else {
    runs = batterRun;
    m.score += runs;
    if(runs >= 4) {
      document.getElementById('uiScore').classList.add('boundary-anim');
      setTimeout(() => document.getElementById('uiScore').classList.remove('boundary-anim'), 300);
    }
  }

  m.balls--;
  m.ballInOver++;

  // Log commentary to history for reference, not in main UI
  const commArr = isOut ? COMMENTARY['W'] : COMMENTARY[runs];
  const txt = commArr[Math.floor(Math.random()*commArr.length)];
  const actor = isUserBatting ? state.userTeam : (m.meta.t1 === state.userTeam ? m.meta.t2 : m.meta.t1);
  addHistoryLog(`${actor} scored ${runs} (Played ${batterRun}, Bowled ${bowlerRun}) - ${txt}`, isOut);
  
  // Track runs for scorecard
  const runsArray = m.innings === 1 ? m.inn1Runs : m.inn2Runs;
  runsArray.push(isOut ? 'W' : runs);
  
  // End of over or innings logic
  let end = false;
  if(m.wktLeft <= 0 || m.balls <= 0) end = true;
  if(m.innings === 2 && m.score >= m.target) end = true; 

  // Record over summary at the end of every over (6 balls) or inning end
  if (m.ballInOver === 6 || end) {
      const overSummaryArray = m.innings === 1 ? m.inn1Overs : m.inn2Overs;
      overSummaryArray.push({
          score: m.score,
          wkt: state.settings.wickets - m.wktLeft,
          balls: (state.settings.overs * 6) - m.balls,
          runsInOver: runsArray.slice(overSummaryArray.reduce((sum, over) => sum + over.runsInOver.length, 0))
      });
      
      m.ballInOver = 0; // Reset ball count for the next over
  }

  updateScoreBoard();
  updateInningContext();


  if(end){
    document.getElementById('keypad').style.display = 'none';
    
    if(m.innings === 1){
      m.oppScore = m.score;
      m.target = m.score + 1;
      addHistoryLog(`Innings Over. Target: ${m.target}`, true);
      // SHOW START 2ND INNINGS BUTTON
      document.getElementById('nextInnBtn').style.display = 'inline-block';
    } else {
      finishMatch();
    }
  } else if (m.ballInOver === 0) {
      // End of over, but not end of innings
      m.isOverBreak = true;
      document.getElementById('keypad').style.display = 'none';
      document.getElementById('overBreakPrompt').style.display = 'block';
  }
}

function continuePlay() {
    state.match.isOverBreak = false;
    document.getElementById('overBreakPrompt').style.display = 'none';
    document.getElementById('keypad').style.display = 'grid';
    // No need to call initInnings, just resume play
}

function startSecondInnings(){ 
    const m = state.match;
    // Persist scores to meta match object for access after match ends
    const userTeam = state.userTeam;
    const oppTeam = m.meta.t1 === userTeam ? m.meta.t2 : m.meta.t1;
    
    m.meta.scores.inn1.team = m.userBatFirst ? userTeam : oppTeam;
    m.meta.scores.inn1.score = m.oppScore;
    m.meta.scores.inn1.wkt = state.settings.wickets - m.wktLeft;
    m.meta.scores.inn1.balls = (state.settings.overs * 6) - m.balls;
    m.meta.scores.inn1.overs = m.inn1Overs;
    m.meta.scores.inn1.runs = m.inn1Runs;
    
    initInnings(2); 
}

function finishMatch(){
  const m = state.match;
  let userTotal, aiTotal;
  
  const userTeam = state.userTeam;
  const oppTeam = m.meta.t1 === userTeam ? m.meta.t2 : m.meta.t1;
  
  // Persist scores to meta match object for Inning 2
  m.meta.scores.inn2.team = !m.userBatFirst ? userTeam : oppTeam;
  m.meta.scores.inn2.score = m.score;
  m.meta.scores.inn2.wkt = state.settings.wickets - m.wktLeft;
  m.meta.scores.inn2.balls = (state.settings.overs * 6) - m.balls;
  m.meta.scores.inn2.overs = m.inn2Overs;
  m.meta.scores.inn2.runs = m.inn2Runs;
  
  
  // Determine final scores based on who batted second
  if(m.userBatFirst){
    userTotal = m.oppScore; 
    aiTotal = m.score;
  } else {
    aiTotal = m.oppScore; 
    userTotal = m.score;
  }

  let t1Score = (m.meta.t1 === state.userTeam) ? userTotal : aiTotal;
  let t2Score = (m.meta.t1 === state.userTeam) ? aiTotal : userTotal;
  
  processResult(m.meta, t1Score, t2Score);
  
  if (m.meta.type !== 'League') {
      m.meta.winner = userTotal > aiTotal ? state.userTeam : (m.meta.t1 === state.userTeam ? m.meta.t2 : m.meta.t1);
      if (m.meta.type.startsWith('SF')) updateFinalBracket(m.meta);
  }

  // Show UI Result
  document.getElementById('playUI').style.display = 'none';
  document.getElementById('resultUI').style.display = 'block';
  
  if(userTotal > aiTotal){
    document.getElementById('resTitle').innerText = "VICTORY";
    document.getElementById('resTitle').style.color = "var(--success)";
    document.getElementById('resEmoji').innerText = "🏆";
  } else if (aiTotal > userTotal){
    document.getElementById('resTitle').innerText = "DEFEAT";
    document.getElementById('resTitle').style.color = "var(--danger)";
    document.getElementById('resEmoji').innerText = "💔";
  } else {
    document.getElementById('resTitle').innerText = "TIED";
    document.getElementById('resEmoji').innerText = "⚖️";
  }
  document.getElementById('resDesc').innerText = `You: ${userTotal} | AI: ${aiTotal}`;
  
  updateTable();
  renderScheduleList(state.currentScheduleView);
}

function closeMatch(){
  state.matchIndex++;
  state.match = null; // Clear active match state
  
  // Cleanup game UI
  document.getElementById('gameUI').style.display = 'none';
  
  // Re-enable Advance button and return to currentMatch tab view
  document.getElementById('simBtn').disabled = false;
  
  if(state.matchIndex >= state.schedule.length){
      alert(`Tournament Complete! Champion: ${state.schedule.filter(m => m.type === 'Final')[0].winner || 'TBD'}`);
      document.getElementById('simBtn').disabled = true;
  }
  
  updateCurrentMatchTabUI();
  renderScheduleList(state.currentScheduleView); 
}

/* --- SCORECARD MODAL FUNCTIONS --- */

function openScorecardModal() {
    const m = state.match;
    if (!m) return; 

    // Determine which innings have data
    // Check live data first, then fallback to meta data for completed innings
    const inn1HasData = m.inn1Overs.length > 0 || m.meta.scores.inn1.score > 0;
    const inn2HasData = m.inn2Overs.length > 0 || m.meta.scores.inn2.score > 0;

    document.getElementById('scoreBtn1').style.display = inn1HasData ? 'inline-block' : 'none';
    document.getElementById('scoreBtn2').style.display = inn2HasData ? 'inline-block' : 'none';
    
    // If we're in Innings 2, or Innings 1 is completed, show Innings 2 option
    if (m.innings > 1 || m.meta.played) {
        document.getElementById('scoreBtn2').style.display = 'inline-block';
    }


    // Default view: current innings, or Innings 1 if still pending
    let defaultInn = m.innings === 2 ? 'inn2' : 'inn1';
    
    // If the default is 'inn2' but no data yet, fallback to 'inn1'
    if (defaultInn === 'inn2' && !inn2HasData) defaultInn = 'inn1';

    document.getElementById('scorecardModal').style.display = 'flex';
    displayScorecard(defaultInn);
}

function closeScorecardModal(event) {
    if (!event || event.target.id === 'scorecardModal' || event.target.classList.contains('modal-close-btn')) {
        document.getElementById('scorecardModal').style.display = 'none';
    }
}

function displayScorecard(inningsKey) {
    const m = state.match;
    const isInn1 = inningsKey === 'inn1';
    
    // Get team names
    const userTeam = state.userTeam;
    const oppTeam = m.meta.t1 === userTeam ? m.meta.t2 : m.meta.t1;
    
    // Determine the batting team for this specific innings
    const innBatTeam = (isInn1 && m.userBatFirst) || (!isInn1 && !m.userBatFirst) ? userTeam : oppTeam;

    
    let scoreData;
    let overSummaries;

    // Check if the requested innings is the current live innings
    const isLiveInn = m.innings === (isInn1 ? 1 : 2) && !m.meta.played;

    if (isLiveInn) {
        // Live data from current match state
        scoreData = {
            score: m.score,
            wkt: state.settings.wickets - m.wktLeft,
            balls: (state.settings.overs * 6) - m.balls,
            runs: m.innings === 1 ? m.inn1Runs : m.inn2Runs
        };
        overSummaries = m.innings === 1 ? m.inn1Overs : m.inn2Overs;

    } else if (m.meta.played || (isInn1 && m.innings > 1)) {
        // Data from meta object (match finished or innings completed)
        scoreData = m.meta.scores[inningsKey];
        overSummaries = scoreData.overs;
    } else {
        // Requested Innings (e.g., Innings 2) hasn't started yet
        document.getElementById('scoreBtn1').classList.remove('active');
        document.getElementById('scoreBtn2').classList.remove('active');
        document.getElementById(isInn1 ? 'scoreBtn1' : 'scoreBtn2').classList.add('active');
        document.getElementById('scorecardDisplay').innerHTML = `
            <h4 style="margin: 0 0 10px; color: var(--gold);">${innBatTeam} - Innings ${isInn1 ? 1 : 2}</h4>
            <p style="font-size: 14px; color: var(--danger); text-align: center; margin-top: 20px;">
                Innings ${isInn1 ? 1 : 2} has not been played yet.
            </p>
        `;
        return;
    }

    // Toggle active button class
    document.getElementById('scoreBtn1').classList.remove('active');
    document.getElementById('scoreBtn2').classList.remove('active');
    document.getElementById(isInn1 ? 'scoreBtn1' : 'scoreBtn2').classList.add('active');

    let html = `
        <h4 style="margin: 0 0 10px; color: var(--gold);">${innBatTeam} - Innings ${isInn1 ? 1 : 2} Score: ${scoreData.score}/${scoreData.wkt}</h4>
        <p style="font-size: 12px; color: #aaa;">Overs: ${Math.floor(scoreData.balls / 6)}.${scoreData.balls % 6} (Max ${state.settings.overs})</p>
        <table class="scorecard-table" style="width: 100%;">
            <thead>
                <tr>
                    <th style="width: 10%;">Over</th>
                    <th style="width: 20%;">Runs in Over</th>
                    <th style="width: 35%;">Ball-by-Ball</th>
                    <th style="width: 35%;">Score (Wkts)</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    let totalBallsCovered = 0;
    // Over-by-over breakdown
    overSummaries.forEach((over, index) => {
        const overNumber = index + 1;
        const runsInOver = over.runsInOver.filter(r => r !== 'W').reduce((a, b) => a + b, 0);
        const wicketsInOver = over.runsInOver.filter(r => r === 'W').length;
        
        // Format the over run string
        const ballByBall = over.runsInOver.map(r => `<span style="padding: 2px 4px; border-radius: 3px; background: ${r === 'W' ? 'var(--danger)' : r >= 4 ? 'var(--success)' : 'rgba(255,255,255,0.1)'}; color: ${r === 'W' ? '#fff' : r >= 4 ? '#000' : '#fff'}; margin-right: 2px;">${r}</span>`).join('');
        
        html += `
            <tr>
                <td><b>${overNumber}</b></td>
                <td>+${runsInOver} R | ${wicketsInOver} W</td>
                <td>${ballByBall}</td>
                <td>${over.score} (${over.wkt} Wkt)</td>
            </tr>
        `;
        totalBallsCovered = over.balls;
    });
    
    // Display Current Over (only if match is live and current over hasn't finished)
    if (isLiveInn && scoreData.balls > totalBallsCovered) { // Check against total balls covered
         const currentOverRuns = scoreData.runs.slice(totalBallsCovered);
         const currentRunsInOver = currentOverRuns.filter(r => r !== 'W').reduce((a, b) => a + b, 0);
         const currentWicketsInOver = currentOverRuns.filter(r => r === 'W').length;

         const currentBallByBall = currentOverRuns.map(r => `<span style="padding: 2px 4px; border-radius: 3px; background: ${r === 'W' ? 'var(--danger)' : r >= 4 ? 'var(--success)' : 'rgba(255,255,255,0.1)'}; color: ${r === 'W' ? '#fff' : r >= 4 ? '#000' : '#fff'}; margin-right: 2px;">${r}</span>`).join('');

         html += `
             <tr style="background: rgba(0, 210, 255, 0.1);">
                 <td><b>${overSummaries.length + 1}.*</b></td>
                 <td>+${currentRunsInOver} R | ${currentWicketsInOver} W</td>
                 <td>${currentBallByBall}</td>
                 <td>${scoreData.score} (${scoreData.wkt} Wkt)</td>
             </tr>
         `;
    }

    html += `
            </tbody>
        </table>
    `;

    document.getElementById('scorecardDisplay').innerHTML = html;
}


/* --- HELPERS --- */
function addHistoryLog(msg, highlight){
  const d = document.createElement('div');
  d.className = 'log-entry' + (highlight ? ' wicket' : '');
  d.innerHTML = msg;
  const h = document.getElementById('historyLog');
  // Prepend new log entries to the top
  h.insertBefore(d, h.firstChild); 
  
  // Scroll to the top to show the latest log entry
  h.scrollTop = 0;
}

// BOOT
initApp();