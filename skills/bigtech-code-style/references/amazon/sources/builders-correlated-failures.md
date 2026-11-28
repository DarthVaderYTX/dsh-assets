# Minimizing correlated failures in distributed systems | AWS Builder Center

> 来源：[https://builder.aws.com/content/3Ev2H7t3l2eZa9xBXiZcAjz12JK/minimizing-correlated-failures-in-distributed-systems](https://builder.aws.com/content/3Ev2H7t3l2eZa9xBXiZcAjz12JK/minimizing-correlated-failures-in-distributed-systems)  
> 抓取：2026-11-28 21:57 +0800 · HTTP 200 · 原始页面 151521 字节  
> 离线副本，版权归原公司所有；与线上版本不一致时以官网为准。

$

# Minimizing correlated failures in distributed systems

How Amazon minimizes correlated failures in distributed systems, using cell-based design, isolation, and diversity to keep faults from spreading.

$
[Joe Magerramov][Joe Magerramov]
Joe Magerramov
/$
Published Feb 15, 2022
Last modified Feb 15, 2022

---

---

$

## Minimizing correlated failures in distributed systems

Eighteen years ago, just as I was starting my career, I was at a small company working on a web application that allowed consumer goods companies to analyze their sales trends. The application used a three-tier architecture: a frontend written in Java, a backend written in C++, and a relational database to store state. All three components ran on a single server. Of course, now we wouldn’t be happy with such an architecture because it contains a single point of failure. However, back then this was a common setup. If the server failed, we worked really hard to fix the problem or restore the application on a different server. To minimize downtime during such events, a whole ecosystem of servers with redundant and hot-swappable parts (including CPUs) thrived. Some of these servers had price tags that rivaled the value of our small company!
A few years later, I joined Amazon and was exposed to a very different approach to building systems. By that time, Amazon was well on its way to adopting service-oriented architectures and distributed systems. By embracing distributed systems, a rapidly growing online store could deal with ever-increasing scale. However, there was another important benefit. By running on multiple servers, a service could be architected to continue operating even if some of those servers fail, while using relatively inexpensive, commodity servers.

## Achieving fault tolerance

To achieve fault tolerance, a typical Amazon service at that time ran on multiple physical servers behind a load balancer that distributed incoming requests among those servers. To deal with server failures, the load balancer sent a periodic health check (typically a small HTTP request to a well-known URL) to each server. If any of the servers failed to respond several times in a row, the load balancer took that server out of consideration for future requests. To learn more, check out David Yanacek’s article on health checks in this Amazon Builders’ Library article:
Implementing health checks
. To avoid the load balancer itself becoming a single point of failure, two load balancers were arranged into a primary and secondary pair, and the domain name system (DNS) was used to fail over to the secondary if the primary failed. If the system needed persistent storage, a similar technique was used to set up a pair of replicated relational databases, with an active primary and a standby secondary. The following diagram shows an example of this architecture:
﻿
Now we use load balancers like Application Load Balancer or Network Load Balancer, and storage services like Amazon DynamoDB to provide scalable and fault-tolerant building blocks for our services, but the core principle remains unchanged. If we can architect our system to run on multiple redundant servers, and continue to operate even if some of those servers fail, then the availability of the overall system will be much greater than the availability of any single server. This follows from the way probabilities compound. For example, if each server has a 0.01% chance of failing on any given day, then by running on two servers, the probability of both of them failing on the same day is 0.000001%. We go from a somewhat unlikely event, to an incredibly unlikely one!

## The problem with correlated failures

However, we only get the benefit of compounded probabilities if the failures are uncorrelated, that is, if individual failures are always independent. Unfortunately, in the real world that isn’t always the case. A single underlying cause can trigger multiple failures. A correlated failure actually happened in my house: A few years ago, we replaced all the built-in cabinets. Each cabinet used a pair of plastic brackets, like the ones in the following images, to attach its front panel. We used these cabinets without any problem for more than a year. After that, the brackets in the first cabinet broke. A week later the brackets broke in the second cabinet. Then in the third and in the fourth. Within three months, the brackets had broken in every cabinet in our house and needed to be replaced.
﻿
﻿
To this day, we don’t know what caused all the brackets to fail at around the same time. It could have been a production defect that affected the entire batch. Or perhaps the installer chose the wrong bracket type that wasn’t rated for the load it had to bear. Or the failures could have been caused by the moisture level in our house, or the way our family used these cabinets. The important fact was that an unforeseen factor created a condition where instead of failing at independent times the brackets suffered a correlated failure.
We say that a system suffers a correlated failure when multiple independent components fail due to the same underlying cause. Those causes can vary in complexity, and sometimes, as in the case of our failed cabinet brackets, can be hard to predict. (It’s worth noting that there is a similar failure mode called cascading failure, where a failure of a single component causes an increase in load on the next component, causing it to fail, and so on. This article focuses on minimizing the risk of correlated failures. However, avoiding cascading failures can be just as important when building resilient systems.)
Luckily, the reliability of our house didn’t depend on these brackets, and the impact of multiple cabinet brackets failing at the same time was at most a minor inconvenience. But similar risks of correlated failures can exist in distributed systems as well, and when they do, they eat away at the availability gains we achieve from redundancy. Some familiar causes of correlated failures include issues with data center power, network, and cooling. A failure of any of these components can impact all of the servers in that data center. At Amazon, we also learned that without a lot of dedicated engineering work and careful attention, common infrastructure dependencies like DNS can cause correlated failures as well. There’s a popular joke among infrastructure engineers: “It wasn’t DNS. It definitely wasn’t DNS! . . . It was DNS.”
But more subtle risks of correlated failures exist as well. A batch of hardware components could have the same latent manufacturing defect, or a single operator action could have an impact on multiple servers. As hardware components age, failure probabilities increase as well, making it more likely that multiple servers will fail at the same time. These factors work against the distributed system, increasing the probability of multiple simultaneous failures, and thus reducing the effectiveness of redundancy in our architectures.

## Using Regions and Availability Zones

At Amazon, we approach reducing such risks by organizing the underlying infrastructure into multiple Regions and Availability Zones. Each Region is designed to be isolated from all the other Regions, and it consists of multiple Availability Zones. Each Availability Zone consists of one or more discrete data centers that have redundant power, network, and connectivity, and are physically separated by a meaningful distance from other Availability Zones. Infrastructure services like Amazon Elastic Compute Cloud (EC2), Amazon Elastic Block Store (EBS), Elastic Load Balancing (ELB), and Amazon Virtual Private Cloud (VPC) run independent stacks in each Availability Zone that share little to nothing with other Availability Zones. Because any change brings with it a risk of failure, infrastructure teams configure their continuous deployment systems to avoid deploying changes to multiple Availability Zones at the same time. To learn more about our approach to safe, continuous deployments, read Clare Liguori’s article on
Automating safe, hands-off deployments
in the Amazon Builders’ Library.
Separation of infrastructure into independent Availability Zones allows service teams to architect and deploy their services in a way that reduces the risk that a single infrastructure failure will have an impact on the majority of their fleet. By the mid-to-late 2000s, a typical Amazon service used an architecture that looked like this:
﻿
We found Availability Zones to be so powerful at reducing the risk of correlated infrastructure failures, that when Amazon EC2 went public in 2008, Availability Zones were a core feature. These days, AWS customers and internal service teams alike use Availability Zones to build highly available applications on top of EC2. My colleagues Becky Weiss and Mike Furr wrote about getting the most out of Availability Zones in this Amazon Builders’ Library article:
Static stability using Availability Zones.

## Noninfrastructure causes of correlated failures

However, we found that in most systems, the physical infrastructure isn’t the only factor that can cause correlated failures. We discovered that any action performed by an operator or any tool that can act on multiple servers at the same time has the potential to introduce correlated failure modes into the system. Early in my career, when I worked on operational issues it was not uncommon to execute a command on all the servers in the fleet in parallel—for example to grep for a specific log line, or to adjust some operating system parameter. These days, we know that, however unlikely, performing such actions and using such tools can introduce correlated failure modes into the system. This is because if anything goes wrong, it will impact every server at the same time.
Whenever we build with and use such operational tools and practices, we always make sure to introduce velocity controls and feedback loops. This ensures that in the unlikely event that something goes wrong, it will only impact a small percentage of the servers. However, we don’t stop there. We also make sure that our operational tools and practices take Availability Zones into account. While such operational tools are not directly related to the underlying infrastructure boundaries, we know that our services are architected to withstand an Availability Zone failure, thus giving our teams a well understood and practiced fault boundary. For example, a system responsible for automatically patching our servers has both built-in velocity controls and fail-safe mechanisms, but it also never operates on servers from multiple Availability Zones at the same time.
However, we don’t stop at Availability Zones. At AWS, it’s becoming a common practice for services to adopt cellular architectures. Instead of operating a single stack per Availability Zone or Region we subdivide a service into a set of identical and independent partitions called cells. Among other benefits, cells allow us to limit the impact of unforeseen problems or failures. For services that adopt cellular architectures, we make sure that our operational tooling and practices take cells into account and avoid touching multiple cells at the same time.

## Reducing correlated behaviors

Even with all these precautions, most distributed systems still have one important correlating factor—each server in the system runs the same exact software. This situation reminds me of a favorite video game I used to play when I was growing up—Lemmings. The premise of the game was that you controlled a group of adorable little creatures called lemmings, who were traversing a landscape filled with obstacles and deadly traps. The catch was that lemmings lacked free will, so each lemming moved in a predictable algorithmic path. When faced with an obstacle, a lemming would turn around. When faced with a cliff or a trap, a lemming would mindlessly walk straight ahead. And because every lemming followed the same algorithm, if one lemming perished, so did the rest of them. As a player, you had to use the features of the terrain, and a small number of tools, to safely guide the group to the exit.
Although most distributed systems run software that is significantly more sophisticated than the AI in control of a lemming, they can still suffer a similar fate. For most distributed systems, every server in the fleet runs the same exact software, with the same limits and failure modes. Load balancers and other work distribution mechanisms tend to do a really good job of evenly distributing the load across all the servers, which is exactly what we want them to do. However, when a software bug or a load-related failure causes one of the servers in such distributed system to fail, the same cause can also impact the rest of the fleet at the same time.
Early in my career, one common example of such a failure was running out of open file descriptors. In many operating systems, a file descriptor is a data structure that represents an open file or a network socket. There is usually a limit on how many such file descriptors any single process can open at a time. If the limit is exceeded it can cause the application to fail in unpredictable ways. If incoming load caused the software running on one of the servers to run out of open file descriptors and fail, an evenly distributed load would frequently cause the other servers to experience the same fate.
These days, applications are not likely to run out of open file descriptors. Thanks to many hard-won lessons, and the ample memory present in modern servers, most systems default to a high enough file descriptor limit to make running out impractical. Still, other limits, behaviors, and even bugs can exist, and they can introduce correlated failure modes into the system. Where possible, one powerful approach to minimizing risk of correlated failures that we like to use is shuffle sharding, a workload isolation technique that makes sure no two servers in the fleet see the same exact workload. That way, if anything about its workload causes a server to fail, it is unlikely to impact all the servers in the fleet. To learn more, go to the Amazon Builders’ Library article Colm MàcCarthaigh wrote about shuffle sharding: Workload isolation using shuffle-sharding.
Correlated behaviors can be another challenge for redundant systems. This reminds me of another experience I had at home: Several months ago, I was working from home and my home internet service provider (ISP) suffered an outage in my neighborhood. I had several important meetings to attend. Luckily, I had a cellular service from a different provider and was able to quickly set up a Wi-Fi hotspot on my cellphone and tether it to my laptop. To my surprise, the cellular service began experiencing a slowdown as well. I later found out that many of my neighbors, who were also working from home (if you are reading this article at a later date, this was during the time of COVID-19, where many people in North America worked from home), had the same idea, and the cellular network in our neighborhood simply wasn’t ready to handle all that additional load. In this situation, the correlated behavior of the larger system (ISP customers failing over at the same time) caused a failure in the second, completely unrelated, system (the cellular network).
Similar risks exist in distributed systems as well, where it’s possible to end up in a situation where a large number of clients change their behavior at the same time, creating a highly-correlated spike in load. Changing human behavior is really hard. However, changing the behavior of computers is easier. Where possible, one technique we like to use at Amazon is introducing jitter, which is adding a small amount of randomness to common behaviors and limits. Our teams are on the lookout for parts of their system that can result in a highly correlated behavior, and they use jitter to reduce such risks. Here are just a few examples of using jitter to reduce risks of correlated behaviors:

- Varying the frequency at which each server runs housekeeping jobs.

- Adding a small amount of randomness to the delay before a failed API is retried. To learn more about this, go to Marc Brooker’s Amazon Builders’ Library article on adding jitter to retries: [Timeouts, retries, and backoff with jitter.](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

- If the system contains mode shifts (e.g., refreshing its state from a remote data store), varying the thresholds at which such mode shifts occur.

- Varying expiration times of short-term credentials and secrets.

- Varying cache time to live (TTL) across servers.

- Where applicable, adding a small amount of variability to the various resource limits, such as Java virtual machine (JVM) heap and connection pool sizes.

I want to note that one challenge with using jitter is that it can make debugging the overall system more challenging. If the behavior of the application varies across servers and time, bugs and other failures can become harder to reproduce. We found that one approach to manage that downside is to seed the random function that is used to add jitter with a well-known parameter, like the name or IP address of the server. That way, each server will always use consistent and predictable values for its jitter, yet be different from any other server in the fleet.

## Conclusion

Redundancy has been instrumental in helping us build highly available systems, even while using relatively inexpensive hardware components. By architecting our systems to run on multiple servers, we can make sure the system remains available even if some of those servers fail. However, both known and hidden factors can introduce risks of correlated failures, which eat away at the benefits of redundancy in the distributed systems. Some examples of factors that could cause correlated failures are:

- Infrastructure components like power, cooling, and network.

- Common dependencies like DNS.

- Operator actions that touch every server.

- Every server in the fleet having identical behavior and resource limits.

At Amazon, we look at ways to reduce such risks. Availability Zones are one such powerful mechanism. By organizing infrastructure into independent locations that share as little as possible with each other we give our own teams and customers a powerful tool to improve availability of their services. Beyond that, our service teams look for techniques like shuffle sharding and jitter to reduce the risk of a single software problem impacting all the servers in the fleet.
/$
#builders-library
Any opinions in this article are those of the individual author and may not reflect the opinions of AWS.

---

---

Enjoyed reading this content? Let the author know!

Your likes, comments, shares, and saves help creators reach more builders.

$
$

Loading recommendations

/$
/$

Loading article

$
$

Loading recommendations

/$
/$
/$
