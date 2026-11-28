# Operational excellence

> 来源：[https://docs.aws.amazon.com/wellarchitected/latest/framework/operational-excellence.html](https://docs.aws.amazon.com/wellarchitected/latest/framework/operational-excellence.html)  
> 抓取：2026-11-28 21:57 +0800 · HTTP 200 · 原始页面 5035 字节  
> 离线副本，版权归原公司所有；与线上版本不一致时以官网为准。



# Operational excellence

 At Amazon, we define operational excellence as a commitment to build software correctly while consistently delivering a great customer experience. It contains best practices for organizing your team, designing your workload, operating it at scale, and evolving it over time. Operational excellence helps your team focus more of their time on building new features that benefit customers, and less time on maintenance and firefighting. To build correctly, we look to best practices that result in well-running systems, a balanced workload for you and your team, and, most importantly, a great customer experience. 

 Operational excellence is challenging to achieve in environments where operations is perceived as a function isolated and distinct from the lines of business and development teams that it supports. By adopting the practices in the Operational Excellence pillar of the AWS Well-Architected Framework, you can build architectures that provide insight into their status, are designed for effective and efficient operation and event response, and continue to improve and support your business goals. 

 The goal of operational excellence is to get new features and bug fixes into customers' hands quickly and reliably. Organizations that invest in operational excellence consistently delight customers while building new features, making changes, and dealing with failures. Along the way, operational excellence drives toward continuous integration and continuous delivery (CI/CD) by helping developers achieve high-quality results consistently. 

 Operational excellence in the cloud spans four ongoing activities: organizing your teams around business outcomes, preparing your workloads and teams for production, operating your workloads to deliver business value, and evolving them as your needs change. Your organization's leadership defines business objectives. Your organization must understand requirements and priorities and use these to organize and conduct work that supports those outcomes. Your workload must emit the information necessary to support it, and implementing services that automate integration, deployment, and delivery increases the flow of beneficial changes into production by removing repetitive manual work. 

 There may be risks inherent in the operation of your workload. You must understand those risks and make an informed decision to enter production. Your teams must be able to support your workload. Business and operational metrics derived from desired business outcomes help you understand the health of your workload and your operations, and respond to incidents. Your priorities will change as your business needs and environment change. Use these as a feedback loop to continually drive improvement for your organization and the operation of your workload. 

 Underpinning all four activities is the practice of treating [operations as code](ops-operations-as-code.md): defining your infrastructure, configuration, procedures, and responses as versioned, testable code, so operational work is consistent and repeatable rather than manual and improvised. 

 Operational Excellence pillar organizes its guidance into seven capabilities, each made up of individual best practices. The capabilities carry out the four activities across the workload lifecycle. 

## Prepare
<a name="prepare"></a>

 Ready your workloads and teams for production. 
+  [Adopt change flow processes with quality gates](ops03.md) 
+  [Mitigate deployment risks](ops04.md) 
+  [Establish workload supportability for production](ops05.md) 

## Operate
<a name="operate"></a>

 Run your workloads to deliver business value, understand their health, and respond when something goes wrong. 
+  [Observe from multiple perspectives](ops01.md) 
+  [Derive essential insights](ops02.md) 
+  [Create an effective event response](ops06.md) 

## Evolve
<a name="evolve"></a>

 Learn from what happens and improve continuously. 
+  [Learn and evolve from events](ops07.md) 

 Organizing your teams around business outcomes is the foundation the other three activities build on. It is set by leadership and reflected in how you structure, prioritize, and fund work, rather than in a single capability. 

 This guidance is written for the technology and operations roles responsible for building, running, and improving workloads, including chief technology officers (CTOs), vice presidents of engineering, engineering and operations leaders, architects, developers, DevOps and infrastructure engineers, site reliability engineers (SREs), and operations and on-call teams, along with the product managers and business stakeholders who set the outcomes these teams deliver. After reading it, you will understand the AWS recommendations and strategies to apply when you design and operate cloud architectures with operational excellence in mind, so you can deliver a reliable customer experience, respond effectively to operational events, and continually improve your workloads and operations. 
