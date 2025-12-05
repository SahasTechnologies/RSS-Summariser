Hello, please _read me_

Visit site [https://rss-summariser.pages.dev/](https://rss-summariser.pages.dev/)

# RSS Feed Summariser
Made possible with **HuggingFace Free models**

put in the link for your rss feed and it summarises it like magic
(the magic is ai)

## How this works:
1. You enter the link of the RSS feed you want to summarise
2. The site parses the RSS and sends it over to HuggingFace for it to be summarised
3. **Please do not reload the site when it is fetching the summarised articles, otherwise it doesn't work**, also sometimes it might take a while due to server lag of HuggingFace
4. It sends the summarised articles back to the site for viewing
5. These articles are stored in localStorage for the next time you reload the site
6. Once you are done, the 'Mark as Read' button removed it from your list and saves that you have read it in localStorage so that it doesn't reload when you close and open the site
7. Every time you reload, the site checks for new articles for all of your RSS sites automatically, _without you having to do anything_!

## Working site example:
<img width="2850" height="2286" alt="rss-summariser pages dev_ (2)" src="https://github.com/user-attachments/assets/edd1f16b-0752-4bc7-bbbb-a0c55253e21a" />
The moon icon isn't at the top of the page since in the screenshot I was at the bottom and the chrome default full page screenshot doesn't account for that

## Site Themes:
<img width="2880" height="1530" alt="rss-summariser pages dev_" src="https://github.com/user-attachments/assets/6dcff825-e2fb-4a32-9717-9997967ecd3c" />
<img width="2880" height="1530" alt="rss-summariser pages dev_ (1)" src="https://github.com/user-attachments/assets/af3edd09-cea4-4e0b-be87-f53a46787515" />
There is both a light theme and the dark theme, and the site:

1. remembers your choice of dark/light in localSotrage if you change it from the default
2. The default is automatically set to your system theme if this is the first time you have visited the site, otherwise it changes to whatever theme you have set
3. there is a very nice animation of the sun and moon when you change themes you should try it
