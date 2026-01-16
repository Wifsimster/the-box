import type { Tournament, TournamentLeaderboardEntry } from '../../domain/tournament/types.js'

export interface EmailTemplate {
    subject: string
    html: string
}

export class TournamentEmailTemplates {
    private baseUrl: string

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl
    }

    tournamentStart(tournament: Tournament): EmailTemplate {
        const subject = `🎮 ${tournament.name} Has Started!`
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; }
    .content { padding: 40px 30px; }
    .tournament-info { background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; }
    .tournament-info h2 { margin-top: 0; color: #333; font-size: 20px; }
    .tournament-info p { margin: 10px 0; color: #666; }
    .cta-button { display: inline-block; background-color: #667eea; color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
    .cta-button:hover { background-color: #5568d3; }
    .footer { background-color: #f8f9fa; padding: 30px; text-align: center; color: #666; font-size: 14px; }
    .prize { background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 20px 0; }
    .emoji { font-size: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏆 Tournament Started!</h1>
    </div>
    <div class="content">
      <h2>The ${tournament.name} is now live!</h2>
      <p>Join players from around the world and compete for the top spot on the leaderboard.</p>
      
      <div class="tournament-info">
        <h2>Tournament Details</h2>
        <p><strong>📅 Period:</strong> ${this.formatDate(tournament.startDate)} - ${this.formatDate(tournament.endDate)}</p>
        <p><strong>🎯 Type:</strong> ${tournament.type.charAt(0).toUpperCase() + tournament.type.slice(1)} Tournament</p>
        ${tournament.prizeDescription ? `
        <div class="prize">
          <p><strong>🎁 Prizes:</strong></p>
          <p>${tournament.prizeDescription}</p>
        </div>
        ` : ''}
      </div>

      <p>Complete daily challenges during the tournament period to accumulate points. Your total score across all challenges will determine your final ranking!</p>

      <div style="text-align: center;">
        <a href="${this.baseUrl}/tournaments/${tournament.id}" class="cta-button">View Tournament Leaderboard</a>
      </div>

      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        <strong>Pro tip:</strong> Play every day to maximize your score and climb the leaderboard. Good luck!
      </p>
    </div>
    <div class="footer">
      <p>You're receiving this email because you're a registered player on The Box.</p>
      <p>&copy; ${new Date().getFullYear()} The Box. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim()

        return { subject, html }
    }

    tournamentReminder(tournament: Tournament, hoursRemaining: number): EmailTemplate {
        const subject = `⏰ ${tournament.name} Ends Soon!`
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; }
    .content { padding: 40px 30px; }
    .urgency-box { background-color: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .urgency-box h2 { color: #856404; margin-top: 0; }
    .countdown { font-size: 36px; font-weight: bold; color: #f5576c; margin: 10px 0; }
    .cta-button { display: inline-block; background-color: #f5576c; color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
    .cta-button:hover { background-color: #e04658; }
    .footer { background-color: #f8f9fa; padding: 30px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ Last Chance!</h1>
    </div>
    <div class="content">
      <h2>The ${tournament.name} is ending soon!</h2>
      
      <div class="urgency-box">
        <h2>Time Remaining</h2>
        <div class="countdown">${hoursRemaining} hours</div>
        <p>Don't miss your chance to compete!</p>
      </div>

      <p>This is your final reminder that the tournament ends on <strong>${this.formatDate(tournament.endDate)}</strong>.</p>
      
      <p>Make sure to complete any remaining daily challenges to improve your score and secure your position on the leaderboard!</p>

      <div style="text-align: center;">
        <a href="${this.baseUrl}/tournaments/${tournament.id}" class="cta-button">Check Your Ranking</a>
      </div>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} The Box. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim()

        return { subject, html }
    }

    tournamentResults(
        tournament: Tournament,
        topPerformers: TournamentLeaderboardEntry[],
        userRank?: number,
        userScore?: number
    ): EmailTemplate {
        const subject = `🏆 ${tournament.name} Results`
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; text-shadow: 2px 2px 4px rgba(0,0,0,0.2); }
    .content { padding: 40px 30px; }
    .podium { display: table; width: 100%; margin: 30px 0; }
    .podium-item { display: table-cell; text-align: center; vertical-align: bottom; padding: 10px; }
    .podium-rank { font-size: 48px; margin-bottom: 10px; }
    .podium-name { font-weight: bold; color: #333; margin: 5px 0; }
    .podium-score { color: #667eea; font-weight: 600; }
    .leaderboard { background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .leaderboard-row { display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #e0e0e0; }
    .leaderboard-row:last-child { border-bottom: none; }
    .rank-badge { background-color: #667eea; color: white; border-radius: 50%; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; }
    .user-stats { background-color: #e7f3ff; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .cta-button { display: inline-block; background-color: #667eea; color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
    .footer { background-color: #f8f9fa; padding: 30px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏆 Tournament Complete!</h1>
    </div>
    <div class="content">
      <h2>${tournament.name} Has Ended</h2>
      <p>Thank you to all participants for an exciting tournament! Here are the final results:</p>

      <div class="podium">
        ${topPerformers.slice(0, 3).map((performer, index) => {
            const medals = ['🥇', '🥈', '🥉']
            return `
        <div class="podium-item">
          <div class="podium-rank">${medals[index]}</div>
          <div class="podium-name">${this.escapeHtml(performer.displayName || performer.username)}</div>
          <div class="podium-score">${performer.totalScore.toLocaleString()} pts</div>
        </div>
          `
        }).join('')}
      </div>

      ${topPerformers.length > 3 ? `
      <div class="leaderboard">
        <h3 style="margin-top: 0;">Top ${Math.min(10, topPerformers.length)} Players</h3>
        ${topPerformers.slice(0, 10).map((performer) => `
        <div class="leaderboard-row">
          <div>
            <span class="rank-badge">${performer.rank}</span>
            <strong style="margin-left: 10px;">${this.escapeHtml(performer.displayName || performer.username)}</strong>
          </div>
          <div style="color: #667eea; font-weight: 600;">${performer.totalScore.toLocaleString()} pts</div>
        </div>
        `).join('')}
      </div>
      ` : ''}

      ${userRank && userScore ? `
      <div class="user-stats">
        <h3 style="margin-top: 0;">Your Performance</h3>
        <p style="font-size: 18px; margin: 10px 0;">
          <strong>Final Rank:</strong> #${userRank}<br>
          <strong>Total Score:</strong> ${userScore.toLocaleString()} points
        </p>
        ${userRank <= 10 ? '<p style="color: #28a745; font-weight: bold;">🎉 Congratulations! You finished in the top 10!</p>' : ''}
      </div>
      ` : ''}

      ${tournament.prizeDescription ? `
      <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 20px 0;">
        <p><strong>🎁 Prizes Awarded:</strong></p>
        <p>${tournament.prizeDescription}</p>
      </div>
      ` : ''}

      <div style="text-align: center;">
        <a href="${this.baseUrl}/tournaments/${tournament.id}" class="cta-button">View Full Results</a>
      </div>

      <p style="margin-top: 30px; text-align: center; color: #666;">
        Keep playing to improve your skills and prepare for the next tournament!
      </p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} The Box. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim()

        return { subject, html }
    }

    private formatDate(dateStr: string): string {
        const date = new Date(dateStr)
        return date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        })
    }

    private escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }
        return text.replace(/[&<>"']/g, (char) => map[char] || char)
    }
}
