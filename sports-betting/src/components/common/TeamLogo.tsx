'use client';

import { useState } from 'react';
import Image from 'next/image';

interface TeamLogoProps {
  abbreviation: string;
  teamName: string;
  sport?: string;
  teamId?: number | string;
}

export function TeamLogo({ 
  abbreviation, 
  teamName, 
  sport, 
  teamId 
}: TeamLogoProps) {
  const [imageExists, setImageExists] = useState(true);

  // For soccer teams, use the football-data.org API
  let logoUrl = `/logos/${abbreviation}.png`; // Default logo
  
  if (sport === 'soccer' && teamId !== undefined) {
    // Use the football-data.org API for soccer team logos
    logoUrl = `https://crests.football-data.org/${teamId}.png`;
  }

  return imageExists ? (
    <Image
      src={logoUrl}
      alt={`${teamName} logo`}
      width={32}
      height={32}
      className="rounded-full"
      onError={() => setImageExists(false)}
    />
  ) : (
    // Fallback if image doesn't exist
    <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs font-medium">
      {abbreviation?.substring(0, 2) || "?"}
    </div>
  );
}
