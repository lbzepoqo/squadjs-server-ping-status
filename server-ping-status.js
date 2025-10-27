import Discord from 'discord.js';
import tinygradient from 'tinygradient';
import DiscordBaseMessageUpdater from './discord-base-message-updater.js';

export default class ServerPingStatus extends DiscordBaseMessageUpdater {
    static get description() {
        return 'The <code>ServerPingStatus</code> plugin can be used to display server ping information in Discord.';
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            ...DiscordBaseMessageUpdater.optionsSpecification,
            command: {
                required: false,
                description: 'Command name to get message.',
                default: '!serverpings'
            },
            updateInterval: {
                required: false,
                description: 'How frequently to update the server ping info in Discord.',
                default: 30 * 1000
            },
            enablePingAlerts: {
                required: false,
                description: 'Enable visual alert styling in status message when regional pings fail.',
                default: true
            },
            pingAlertRoles: {
                required: false,
                description: 'Array of Discord role IDs to mention in the status message when pings fail.',
                default: []
            },
            pingAlertUsers: {
                required: false,
                description: 'Array of Discord user IDs to mention in the status message when pings fail.',
                default: []
            },
            pingFailureThreshold: {
                required: false,
                description: 'Ping value that indicates a regional ping failure.',
                default: 9999
            },
            minFailedRegions: {
                required: false,
                description: 'Minimum number of regions that must fail to trigger visual alert.',
                default: 3
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.updateMessages = this.updateMessages.bind(this);
        this.onServerInfoUpdated = this.onServerInfoUpdated.bind(this);

        this.serverInfo = null;
    }

    async mount() {
        await super.mount();
        this.updateMessages();
        this.updateInterval = setInterval(this.updateMessages, this.options.updateInterval);

        this.server.on('UPDATED_SERVER_INFORMATION', this.onServerInfoUpdated);
    }

    async unmount() {
        await super.unmount();
        clearInterval(this.updateInterval);

        this.server.removeListener('UPDATED_SERVER_INFORMATION', this.onServerInfoUpdated);
    }

    async prepareToMount() {
        await this.SubscribedMessage.sync();
    }

    async onServerInfoUpdated(data) {
        this.serverInfo = data.raw;
        // this.verbose(1, 'Server information updated', this.serverInfo);
    }

    async generateMessage() {
        if (!this.serverInfo) {
            return;
        }

        // Identify all regions with their ping values
        const regions = [
            'ap-east-1', 'ap-southeast-1', 'ap-southeast-2',
            'eu-central-1', 'eu-north-1', 'eu-west-2',
            'me-central-1', 'us-east-1', 'us-west-1'
        ];

        // Find failed regions if alerts are enabled
        let failedRegions = [];
        let hasCriticalFailure = false;
        if (this.options.enablePingAlerts) {
            failedRegions = regions.filter(region => {
                const ping = parseInt(this.serverInfo[`${region}_I`] || '0');
                return ping >= this.options.pingFailureThreshold;
            });
            hasCriticalFailure = failedRegions.length >= this.options.minFailedRegions;
        }

        const embed = {};

        embed.title = hasCriticalFailure
            ? `⚠️ ${this.serverInfo.ServerName_s} - Ping Alert`
            : `${this.serverInfo.ServerName_s} - Ping Information`;

        let description = `**Game Mode:** ${this.serverInfo.GameMode_s}\n` +
            `**Map:** ${this.serverInfo.MapName_s}\n` +
            `**Players:** ${this.serverInfo.PlayerCount_I}/${this.serverInfo.MaxPlayers}`;

        // Add alert warning if critical failure detected
        if (hasCriticalFailure) {
            description += `\n\n🚨 **ALERT: ${failedRegions.length}/${regions.length} regions are unreachable!**`;
        }

        embed.description = description;

        const sortedRegions = [ ...regions ].sort((a, b) => {
            const aValue = parseInt(this.serverInfo[ `${a}_I` ] || '999');
            const bValue = parseInt(this.serverInfo[ `${b}_I` ] || '999');
            return aValue - bValue;
        });

        let pingsFormatted = '**Regional Ping Times**\n';
        const highlightRegion = this.serverInfo.Region_s;

        sortedRegions.forEach(region => {
            const ping = this.serverInfo[ `${region}_I` ];
            if (ping) {
                let pingQuality = '';
                const pingValue = parseInt(ping);
                if (pingValue < 50) pingQuality = '🟢';
                else if (pingValue < 100) pingQuality = '🟡';
                else if (pingValue < 200) pingQuality = '🟠';
                else pingQuality = '🔴';

                let regionLabel = '';
                if (region.startsWith('eu-')) {
                    const regionPart = region.split('-')[ 1 ];
                    regionLabel = `EU ${regionPart.charAt(0).toUpperCase() + regionPart.slice(1)}`;
                    if (region.endsWith('-1') || region.endsWith('-2')) {
                        regionLabel += ` ${region.charAt(region.length - 1)}`;
                    }
                }
                else if (region.startsWith('us-')) {
                    const regionPart = region.split('-')[ 1 ];
                    regionLabel = `US ${regionPart.charAt(0).toUpperCase() + regionPart.slice(1)}`;
                    if (region.endsWith('-1') || region.endsWith('-2')) {
                        regionLabel += ` ${region.charAt(region.length - 1)}`;
                    }
                }
                else if (region.startsWith('ap-east')) {
                    regionLabel = 'AP East';
                    if (region.endsWith('-1')) regionLabel += ' 1';
                }
                else if (region.startsWith('ap-southeast')) {
                    regionLabel = `AP Southeast ${region.charAt(region.length - 1)}`;
                }
                else if (region.startsWith('me-')) {
                    const regionPart = region.split('-')[ 1 ];
                    regionLabel = `ME ${regionPart.charAt(0).toUpperCase() + regionPart.slice(1)}`;
                    if (region.endsWith('-1')) regionLabel += ' 1';
                }

                if (region === highlightRegion) {
                    regionLabel = `**${regionLabel}**`;
                }

                pingsFormatted += `${regionLabel}: ${pingQuality} ${ping}ms\n`;
            }
        });

        embed.description += `\n\n${pingsFormatted}`;

        let footerInfo = '';

        if (this.serverInfo.Region_s) {
            footerInfo += `**Server Region**\n${this.serverInfo.Region_s}`;

            if (this.serverInfo.Region_s.startsWith('eu-')) {
                const regionPart = this.serverInfo.Region_s.split('-')[ 1 ];
                footerInfo += ` (EU ${regionPart.charAt(0).toUpperCase() + regionPart.slice(1)})`;
            }

            footerInfo += '\n\n';
        }

        if (this.serverInfo.TeamOne_s && this.serverInfo.TeamTwo_s) {
            footerInfo += `**Teams**\n`;
            footerInfo += `Team 1: ${this.serverInfo.TeamOne_s}\n`;
            footerInfo += `Team 2: ${this.serverInfo.TeamTwo_s}\n\n`;
        }

        footerInfo += `Game Version: ${this.serverInfo.GameVersion_s} • Today at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;

        embed.description += `\n\n${footerInfo}`;

        // Set color: red if critical failure, otherwise based on player count
        if (hasCriticalFailure) {
            embed.color = 0xff6b6b; // Red for alert
        } else {
            const playerPercentage = this.serverInfo.PlayerCount_I / this.serverInfo.MaxPlayers;
            embed.color = (
                parseInt(
                    tinygradient([
                        { color: '#ff0000', pos: 0 },
                        { color: '#ffff00', pos: 0.3 },
                        { color: '#00ff00', pos: 0.6 },
                        { color: '#0000ff', pos: 1 }
                    ])
                        .rgbAt(Math.min(1, playerPercentage))
                        .toHex(),
                    16
                )
            );
        }

        // Build mention string if critical failure and mentions configured
        let content = '';
        if (hasCriticalFailure && (this.options.pingAlertRoles.length > 0 || this.options.pingAlertUsers.length > 0)) {
            const mentions = [];
            this.options.pingAlertRoles.forEach(roleId => mentions.push(`<@&${roleId}>`));
            this.options.pingAlertUsers.forEach(userId => mentions.push(`<@${userId}>`));
            content = mentions.join(' ');
        }

        return { content, embeds: [ embed ] };
    }
}