module.exports = {
  apps: [
    {
      name: 'congrats-bot',
      script: 'npm',
      args: 'run start:prod',
      cwd: '/root/congrats_bot',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/new_year_bot?schema=public',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        BOT_TOKEN: '8516103456:AAFLooN_h0qcXLK37HeHxvggpBMmXzH_QRU',
        BOT_MODE: 'polling',
        BOT_ADMINS: '[]',
        BOT_ALLOWED_UPDATES: '[]',
        LOG_LEVEL: 'info',
        DEBUG: 'false',
        ELEVENLABS_VOICE_ID: 'BgOb4tTqXTvOVTK0lgE3',
        ELEVENLABS_API_KEY: 'sk_75ad771b1f9bd6e92b1e3e02f9dfa79b673660051f92e912',
        ELEVENLABS_API_SETTINGS: '{"voice_settings": {"stability": 0.90,"similarity_boost": 0.75,"style": 0.2,"use_speaker_boost": false}}',
        SOURCE_VIDEO_PATH: './assets/kiber-ded-1-small.mp4',
        AUDIO_INSERT_TIMECODE: '00:00:28:21',
        SEND_COUPONS: 'true',
        NOTIFICATION_GROUP_CHAT_ID: '-1002314493614',
      },
      // Automatically restart on crash
      autorestart: true,
      // Max memory before restart
      max_memory_restart: '500M',
      // Error log file
      error_file: '/root/.pm2/logs/congrats-bot-error.log',
      // Output log file
      out_file: '/root/.pm2/logs/congrats-bot-out.log',
      // Merge logs
      merge_logs: true,
      // Time format for logs
      time: true,
    },
    {
      name: 'congrats-worker',
      script: 'npm',
      args: 'run worker:prod',
      cwd: '/root/congrats_bot',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/new_year_bot?schema=public',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        BOT_TOKEN: '8516103456:AAFLooN_h0qcXLK37HeHxvggpBMmXzH_QRU',
        BOT_MODE: 'polling',
        LOG_LEVEL: 'info',
        DEBUG: 'false',
        ELEVENLABS_VOICE_ID: 'BgOb4tTqXTvOVTK0lgE3',
        ELEVENLABS_API_KEY: 'sk_75ad771b1f9bd6e92b1e3e02f9dfa79b673660051f92e912',
        ELEVENLABS_API_SETTINGS: '{"voice_settings": {"stability": 0.90,"similarity_boost": 0.75,"style": 0.2,"use_speaker_boost": false}}',
        SOURCE_VIDEO_PATH: './assets/kiber-ded-1-small.mp4',
        AUDIO_INSERT_TIMECODE: '00:00:28:21',
        SEND_COUPONS: 'true',
        NOTIFICATION_GROUP_CHAT_ID: '-1002314493614',
      },
      // Automatically restart on crash
      autorestart: true,
      // Max memory before restart
      max_memory_restart: '500M',
      // Error log file
      error_file: '/root/.pm2/logs/congrats-worker-error.log',
      // Output log file
      out_file: '/root/.pm2/logs/congrats-worker-out.log',
      // Merge logs
      merge_logs: true,
      // Time format for logs
      time: true,
    },
  ],
};
