# Utvecklingsinstruktioner för Olle-pwa-

## Superpowers och Codex

Detta projekt ska utvecklas med Superpowers-arbetsflödet när pluginet är installerat i Codex.
- Kontrollera först om Superpowers finns tillgängligt. Om det saknas, förklara att det behöver installeras via Codex Plugins; påstå inte att pluginet är aktivt.
- Vid större ändringar: klarlägg behov, föreslå en kort design och invänta godkännande innan kod ändras.
- Arbeta i separat gren för riskfyllda ändringar. Dela upp arbetet, skriv tester före eller parallellt med implementering och granska ändringarna.
- Utför verkliga tester och redovisa vilka tester som körts, vad som lyckats och vad som återstår.
- Bevara befintliga funktioner, data och konfiguration. Ingen radering, publicering eller migration utan uttryckligt godkännande.
- Håll enkla ändringar enkla; undvik onödiga beroenden och ombyggnader.
- Skydda nycklar, personuppgifter och kunddata. Exponera aldrig hemligheter i kod eller loggar.

OBS: Denna AGENTS.md aktiverar inte Superpowers på egen hand. Pluginet installeras separat i Codex.

## Projektfokus

Prioritera enkel mobilanvändning, pålitliga påminnelser och tydlig användarkontroll. AI-agenten får inte skicka meddelanden, ändra kalender eller utföra externa åtgärder utan behörighet och avsedd bekräftelse.
