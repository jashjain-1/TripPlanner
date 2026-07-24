const navbar=document.querySelector(".navbar");

if (navbar) {
    window.addEventListener("scroll",function(){
        navbar.style.background=window.scrollY>50?"#08101f":"#0f172a";
        navbar.style.boxShadow=window.scrollY>50?"0 4px 12px rgba(0,0,0,.3)":"none";
    });
}

document.querySelectorAll('a[href^="#"]').forEach(function(link){
    link.addEventListener("click",function(e){
        const targetAttr = this.getAttribute("href");
        if (targetAttr && targetAttr !== "#") {
            const target=document.querySelector(targetAttr);
            if(target){
                e.preventDefault();
                target.scrollIntoView({behavior:"smooth"});
            }
        }
    });
});
