import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from '../firebase'; // Import the db instance

// --- Priority order helpers ---
const prRank = (cat) => (cat === 'nice-to-know' ? 3 : cat === 'good-to-know' ? 2 : 1);
const sortByPriorityAsc = (a, b) => prRank(a.category) - prRank(b.category);
const importanceOrder = { "must-know": 1, "good-to-know": 2, "nice-to-know": 3 };
const sortChapters = (chapters) => chapters.sort((a, b) => importanceOrder[a.category] - importanceOrder[b.category]);


function rebalanceBins(dayBins, maxPerDay) {
  if (!dayBins.length) return;
  for (const bin of dayBins) bin.sort(sortByPriorityAsc);
  let safety = 1000;
  while (safety-- > 0) {
    let maxLoad = -1, minLoad = Infinity, maxIdx = -1, minIdx = -1;
    dayBins.forEach((bin, i) => {
      if (bin.length > maxLoad) { maxLoad = bin.length; maxIdx = i; }
      if (bin.length < minLoad) { minLoad = bin.length; minIdx = i; }
    });
    if (maxLoad - minLoad <= 1) break;
    const move = (from, to) => {
      if (dayBins[from].length > 0 && dayBins[to].length < maxPerDay) {
        let movedItem = dayBins[from].pop();
        dayBins[to].push(movedItem);
        return true;
      }
      return false;
    };
    if (!move(maxIdx, minIdx)) break;
  }
  for (const bin of dayBins) bin.sort(sortByPriorityAsc);
}

export const daysBetween = (start, end) => {
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (isNaN(startDate) || isNaN(endDate) || endDate < startDate) return 0;
    const diffTime = Math.abs(endDate - startDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive
};

// --- The main intelligent scheduling algorithm ---
export const generateSchedule = async (planDetails) => {
    const { startDate, examDate, organSystemConfig, maxChaptersPerDay } = planDetails;
    const messages = [];
    let schedule = {};
    const updatedConfig = JSON.parse(JSON.stringify(organSystemConfig));

    if (!examDate) {
        alert("Please set an exam date to update the schedule.");
        return null;
    }

    const availableDays = daysBetween(startDate, examDate) - 1;
    if (availableDays < 0) {
        alert("Exam date must be on or after the start date.");
        return null;
    }

    const sectionsData = [];
    const normalizeCategory = (cat) => {
      const s = String(cat || '').toLowerCase().trim().replace(/[_\s]+/g, '-');
      if (s.startsWith('must')) return 'must-know';
      if (s.startsWith('good')) return 'good-to-know';
      if (s.startsWith('nice') || s.startsWith('optional')) return 'nice-to-know';
      return 'good-to-know';
    };
    for (const system of updatedConfig) {
        const systemId = system.id || system.name;
        const nodesRef = collection(db, 'sections', systemId, 'nodes');
        const chaptersQuery = query(nodesRef, where("parentId", "==", null), orderBy("order"));
        const chaptersSnapshot = await getDocs(chaptersQuery);
        const chapters = chaptersSnapshot.docs.map(d => ({...d.data(), category: normalizeCategory(d.data().category)}));
        const defaultDays = system.defaultDays ?? system.days ?? chapters.length;
        const locked = Number.isFinite(system.days) && system.days !== defaultDays;
        sectionsData.push({ ...system, id: systemId, chapters, defaultDays, locked, lockedDays: system.days });
    }

    sectionsData.forEach(s => {
        const mustKnows = s.chapters.filter(c => c.category === 'must-know');
        s.minRequiredDays = Math.ceil(mustKnows.length / maxChaptersPerDay);
    });
    
    const finalBudgets = {};
    const lockedSections = sectionsData.filter(s => s.locked);
    const unlockedSections = sectionsData.filter(s => !s.locked);
    let sumLockedDays = 0;
    lockedSections.forEach(s => {
        const budget = Math.max(s.lockedDays, s.minRequiredDays);
        finalBudgets[s.id] = budget;
        sumLockedDays += budget;
    });

    if (sumLockedDays > availableDays) {
        alert("Your manually set ('locked') days exceed the available time. Please reduce some locked days or extend the exam date.");
        return null;
    }

    const freeDays = availableDays - sumLockedDays;
    const sumDefaultUnlocked = unlockedSections.reduce((sum, s) => sum + s.defaultDays, 0);

    if (sumDefaultUnlocked <= 0) {
        unlockedSections.forEach(s => { finalBudgets[s.id] = s.minRequiredDays; });
    } else if (freeDays >= sumDefaultUnlocked) { 
        unlockedSections.forEach(s => finalBudgets[s.id] = s.defaultDays);
        let surplusDays = freeDays - sumDefaultUnlocked;
        if(surplusDays > 0) {
            let scaled = unlockedSections.map(s => ({
                id: s.id,
                rawShare: surplusDays * (s.defaultDays / sumDefaultUnlocked),
                remainder: (surplusDays * (s.defaultDays / sumDefaultUnlocked)) - Math.floor(surplusDays * (s.defaultDays / sumDefaultUnlocked)),
                defaultDays: s.defaultDays
            }));
            scaled.forEach(s => { finalBudgets[s.id] += Math.floor(s.rawShare); });
            let remainingSurplus = surplusDays - scaled.reduce((sum, s) => sum + Math.floor(s.rawShare), 0);
            scaled.sort((a,b) => b.remainder - a.remainder || b.defaultDays - a.defaultDays);
            for (let i = 0; i < remainingSurplus; i++) finalBudgets[scaled[i].id]++;
        }
    } else {
        let scaled = unlockedSections.map(s => ({
            id: s.id,
            raw: s.defaultDays * (freeDays / sumDefaultUnlocked),
            base: Math.max(Math.floor(s.defaultDays * (freeDays / sumDefaultUnlocked)), s.minRequiredDays),
            remainder: (s.defaultDays * (freeDays / sumDefaultUnlocked)) - Math.floor(s.defaultDays * (freeDays / sumDefaultUnlocked)),
            defaultDays: s.defaultDays,
            minRequiredDays: s.minRequiredDays
        }));
        let sumBase = scaled.reduce((sum, s) => sum + s.base, 0);
        let remaining = freeDays - sumBase;
        if (remaining > 0) {
            scaled.sort((a,b) => b.remainder - a.remainder || b.defaultDays - a.defaultDays);
            for(let i = 0; i < remaining; i++) scaled[i].base++;
        } else if (remaining < 0) {
            let toRemove = -remaining;
            scaled.sort((a,b) => a.remainder - b.remainder || a.defaultDays - b.defaultDays);
            for (let i = 0; i < scaled.length && toRemove > 0; i++) {
                const give = Math.min(toRemove, Math.max(0, scaled[i].base - scaled[i].minRequiredDays));
                if (give > 0) { scaled[i].base -= give; toRemove -= give; }
            }
            if (toRemove > 0) { alert(`Plan is infeasible.`); return null; }
        }
        scaled.forEach(s => { finalBudgets[s.id] = s.base; });
    }

    let currentDate = new Date(`${startDate}T00:00:00`);
    for (const section of sectionsData) {
      let userDays = finalBudgets[section.id];
      if (!Number.isFinite(userDays) || userDays < section.minRequiredDays) {
        userDays = section.minRequiredDays;
      }
      
      const configToUpdate = updatedConfig.find(s => (s.id || s.name) === section.id);
      if (configToUpdate) configToUpdate.days = userDays;
      
      const { chapters } = section;
      const totalChapters = chapters.length;
      let dayBins = [];

      if (userDays >= totalChapters && totalChapters > 0) {
        let extraDays = userDays - totalChapters;
        let chapterPool = chapters.map(ch => ({ ...ch, scheduledDays: 1 }));
        sortChapters(chapterPool);
        let i = 0;
        while (extraDays > 0) {
            chapterPool[i].scheduledDays++;
            extraDays--;
            i = (i + 1) % chapterPool.length;
        }
        chapterPool.forEach(chapter => {
          for(let d = 0; d < chapter.scheduledDays; d++){
            dayBins.push([{...chapter, dayNum: d + 1, totalDays: chapter.scheduledDays}]);
          }
        });
      } else {
        const must = chapters.filter(c => c.category === 'must-know');
        const good = chapters.filter(c => c.category === 'good-to-know');
        const nice = chapters.filter(c => c.category === 'nice-to-know');
        const capacity = userDays * maxChaptersPerDay;
        let selectedChapters = [...must, ...good, ...nice];

        if(selectedChapters.length > capacity){
            const overflow = selectedChapters.length - capacity;
            messages.push(`${section.name}: Dropped ${overflow} topic(s) due to time constraints.`);
            selectedChapters.splice(capacity);
        }
        
        dayBins = Array.from({ length: userDays }, () => []);
        selectedChapters.forEach((chapter, index) => { dayBins[index % userDays].push(chapter); });
        rebalanceBins(dayBins, maxChaptersPerDay);
      }

      dayBins.forEach(day => {
        if (day.length === 0) return;
        const dateKey = [currentDate.getFullYear(), String(currentDate.getMonth() + 1).padStart(2, '0'), String(currentDate.getDate()).padStart(2, '0')].join('-');
        let topicTitle = day.map(c => c.name).join(' & ');
        if(day.length === 1 && day[0].totalDays > 1){ topicTitle += ` (Day ${day[0].dayNum} of ${day[0].totalDays})`; }
        schedule[dateKey] = { topic: `${section.name}: ${topicTitle}`, completed: false };
        currentDate.setDate(currentDate.getDate() + 1);
      });
    }

    if (messages.length) alert(messages.join('\n'));
    return { newSchedule: schedule, updatedConfig: updatedConfig };
};

